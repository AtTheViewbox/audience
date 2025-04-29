// components/Login/LoginTab.jsx
import { useState, useContext } from "react";
import { UserContext } from "../context/UserContext.jsx";
import LoginView from "./LoginView.jsx";
import SignUpView from "./SignUpView.jsx";
import PasswordRecovery from "./PasswordRecovery.jsx";

const LoginState = {
  LOGIN: "login",
  SIGN_UP: "sign up",
  FORGET_PASSWORD: "reset password",
};

export function LoginDialog() {
  const { supabaseClient } = useContext(UserContext).data;
  const [loginState, setLoginState] = useState(LoginState.LOGIN);
  const [loginError, setLoginError] = useState(false);
  const [signUpError, setSignUpError] = useState(null);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleLogin = async () => {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError(true);
    } else {
      setLoginError(false);
      // location.reload(); // Uncomment if needed
    }
  };

  const handleSignUp = async () => {
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    console.log(name, email, password); 

    try {
      setIsLoading(true);
      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (error) {
        console.log(error.message)
        setSignUpError(error.message);
        setSignUpSuccess(false);
      } else {
        setSignUpSuccess(true);
        setSignUpError(null);
      }
    } catch (err) {
      console.error(err);
      setSignUpError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordRecovery = async () => {
    const email = document.getElementById("resetEmail").value;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/audience/passwordreset",
      
    });

    if (error) {
      console.error("Error sending reset email:", error.message);
    } else {
      setResetEmailSent(true);
    }
  };

  // Render based on current state
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
          switchToLogin={() => setLoginState(LoginState.LOGIN)}
        />
      );
    case LoginState.FORGET_PASSWORD:
      return (
        <PasswordRecovery
          onSendReset={sendPasswordRecovery}
          sent={resetEmailSent}
          switchToLogin={() => setLoginState(LoginState.LOGIN)}
        />
      );
    default:
      return <div>Loading...</div>;
  }
}
