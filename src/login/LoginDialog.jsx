import { useState, useContext, useEffect } from "react";
import { UserContext } from "../context/UserContext.jsx";
import LoginView from "./LoginView.jsx";
import SignUpView from "./SignUpView.jsx";
import PasswordRecovery from "./PasswordRecovery.jsx";
import { AuthMode } from "../components/DialogPage.jsx"; // <-- adjust path if needed
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const LoginState = {
  LOGIN: "login",
  SIGN_UP: "sign up",
  FORGET_PASSWORD: "reset password",
};

export function LoginDialog({ authMode, setAuthMode, showHeader = false }) {
  const { supabaseClient } = useContext(UserContext).data;

  const [loginState, setLoginState] = useState(LoginState.LOGIN);
  const [loginError, setLoginError] = useState(false);
  const [signUpError, setSignUpError] = useState(null);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // keep parent tab label in sync with current view
  useEffect(() => {
    if (!setAuthMode) return;
    if (loginState === LoginState.SIGN_UP) setAuthMode(AuthMode.SIGN_UP);
    else if (loginState === LoginState.FORGET_PASSWORD) setAuthMode(AuthMode.RECOVERY);
    else setAuthMode(AuthMode.LOGIN);
  }, [loginState, setAuthMode]);

  const handleLogin = async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError(true);
    } else {
      setLoginError(false);
      location.reload();
    }
  };

  const handleSignUp = async () => {
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      setIsLoading(true);
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (error) {
        setSignUpError(error.message);
        setSignUpSuccess(false);
      } else {
        setSignUpSuccess(true);
        setSignUpError(null);
      }
    } catch (err) {
      setSignUpError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordRecovery = async () => {
    const email = document.getElementById("resetEmail").value;
    const rootUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: rootUrl + "passwordreset",
    });

    if (error) {
      console.error("Error sending reset email:", error.message);
    } else {
      setResetEmailSent(true);
    }
  };

  const goToLogin = () => {
    setResetEmailSent(false);
    setSignUpError(null);
    setSignUpSuccess(false);
    setLoginError(false);
    setLoginState(LoginState.LOGIN);
  };

  const headerContent = {
    [LoginState.LOGIN]: {
      title: "Login",
      description: "Enter your credentials to access your account."
    },
    [LoginState.SIGN_UP]: {
      title: "Create Account",
      description: "Sign up for a new account."
    },
    [LoginState.FORGET_PASSWORD]: {
      title: "Reset Password",
      description: "Enter your email to receive a recovery link."
    }
  }[loginState];

  const renderView = () => {
    switch (loginState) {
      case LoginState.LOGIN:
        return (
          <LoginView
            onLogin={handleLogin}
            loginError={loginError}
            switchToSignUp={() => setLoginState(LoginState.SIGN_UP)}
            switchToReset={() => setLoginState(LoginState.FORGET_PASSWORD)}
          />
        );

      case LoginState.SIGN_UP:
        return (
          <SignUpView
            onSignUp={handleSignUp}
            isLoading={isLoading}
            error={signUpError}
            success={signUpSuccess}
            switchToLogin={goToLogin}
          />
        );

      case LoginState.FORGET_PASSWORD:
        return (
          <PasswordRecovery
            onSendReset={sendPasswordRecovery}
            sent={resetEmailSent}
            switchToLogin={goToLogin}
          />
        );

      default:
        return <div>Loading...</div>;
    }
  };

  return (
    <>
      {showHeader && (
        <DialogHeader className="mb-4">
          <DialogTitle>{headerContent.title}</DialogTitle>
          <DialogDescription>{headerContent.description}</DialogDescription>
        </DialogHeader>
      )}
      {renderView()}
    </>
  );
}
