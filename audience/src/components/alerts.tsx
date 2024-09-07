'use client'

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { XCircle, CheckCircle } from "lucide-react"

export function Alerts() {
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Your payment was declined. Please try again.</AlertDescription>
      </Alert>

      <Alert variant="default" className="border-green-500 bg-green-50 text-green-700">
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Your payment was processed successfully.</AlertDescription>
      </Alert>
    </div>
  )
}