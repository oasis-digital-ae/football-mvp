import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { toast } from '@/shared/components/ui/use-toast';
import { AppValidators, validateAndSanitize } from '@/shared/lib/validation';
import { sanitizeInput } from '@/shared/lib/sanitization';

interface LoginFormProps {
  onSwitchToSignUp: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignUp }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Validate and sanitize form data
      const validation = validateAndSanitize(AppValidators.login, formData, {
        email: 'email',
        password: 'text'
      });
      
      if (!validation.isValid) {
        toast({
          title: "Validation Error",
          description: Object.values(validation.errors).join(', '),
          variant: "destructive"
        });
        return;
      }
      
      await signIn(validation.data.email, validation.data.password);
      toast({
        title: "Success",
        description: "Signed in successfully!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Welcome back! Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: sanitizeInput(e.target.value, 'email') }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: sanitizeInput(e.target.value, 'text') }))}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </Button>
          
          <Button type="button" variant="ghost" className="w-full" onClick={onSwitchToSignUp}>
            Don't have an account? Sign Up
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};