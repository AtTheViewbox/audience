import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AlertCircle, Eye, EyeOff } from "lucide-react"
import { useNavigate } from "react-router-dom";
import { cl } from '../context/SupabaseClient.jsx';


export default function UpdatePasswordForm() {
    const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)


  useEffect(() => {
    cl.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        console.log('Password recovery session:', session);
      }
    });
  }, []);

  async function updatePassword(newPassword) {
    if (document.getElementById("confirmPassword").value != document.getElementById("password").value) {
        setErrors("Passwords do not match")
        return
      }
    setIsLoading(true)
    const { data, error } = await cl.auth.updateUser({
      password: newPassword,
    });
  
    if (error) {
      console.error('Error updating password:', error.message);
      setErrors(error.message)
      setIsLoading(false)
      return { success: false, error };
    } else {
      console.log('Password updated successfully:', data);
      setIsLoading(false)
      navigate("/");
      return { success: true, data };
    }
    
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create new password</h1>
          <p className="mt-2 text-sm text-gray-600">Enter a new password for your account</p>
        </div>
    <Card className="w-full">
     
        <CardContent className="space-y-4 pt-6">
  
          {errors && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p>{errors}</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              New Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your new password"
                disabled={isLoading}
                className={errors? "border-red-500" : ""}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your new password"
                disabled={isLoading }
                className={errors? "border-red-500" : ""}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showConfirmPassword ? "Hide password" : "Show password"}</span>
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" onClick={()=>updatePassword(document.getElementById("confirmPassword").value)}className="w-full" disabled={isLoading }>
            {isLoading ? "Updating..." : "Update password"}
          </Button>
        </CardFooter>
 
    </Card>
    </div>
    </div>
  )
}
