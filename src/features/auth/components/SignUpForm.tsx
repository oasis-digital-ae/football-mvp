import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { toast } from '@/shared/components/ui/use-toast';
import { AppValidators, validateForm, validateAndSanitize } from '@/shared/lib/validation';
import { ValidationError } from '@/shared/lib/error-handling';
import { sanitizeInput } from '@/shared/lib/sanitization';

interface SignUpFormProps {
  onSwitchToLogin: () => void;
}

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Spain', 'Italy', 
  'Netherlands', 'Belgium', 'Portugal', 'Brazil', 'Argentina', 'Mexico', 'Japan', 'South Korea',
  'India', 'China', 'Singapore', 'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Finland'
];

export const SignUpForm: React.FC<SignUpFormProps> = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    birthday: '',
    country: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Validate and sanitize form data
      const validation = validateAndSanitize(AppValidators.userRegistration, formData, {
        email: 'email',
        password: 'text',
        confirmPassword: 'text',
        fullName: 'text',
        birthday: 'text',
        country: 'text',
        phone: 'text'
      });
      
      if (!validation.isValid) {
        setValidationErrors(validation.errors);
        return;
      }
      
      // Additional validation for password confirmation
      if (formData.password !== formData.confirmPassword) {
        setValidationErrors({ confirmPassword: 'Passwords do not match' });
        return;
      }
      
      setLoading(true);
      setValidationErrors({});
      
      await signUp(validation.data.email, validation.data.password, {
        full_name: validation.data.fullName,
        birthday: validation.data.birthday,
        country: validation.data.country,
        phone: validation.data.phone
      });
      
      toast({
        title: "Success",
        description: "Account created successfully! Please check your email to verify your account.",
      });
    } catch (error: any) {
      if (error instanceof ValidationError) {
        setValidationErrors({ general: error.message });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign Up</CardTitle>
        <CardDescription>Create your account to start trading</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData(prev => ({ ...prev, fullName: sanitizeInput(e.target.value, 'text') }))}
              required
            />
          </div>
          
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
            <Label htmlFor="birthday">Birthday</Label>
            <Input
              id="birthday"
              type="date"
              value={formData.birthday}
              onChange={(e) => setFormData(prev => ({ ...prev, birthday: e.target.value }))}
              required
            />
          </div>

          <div>
            <Label htmlFor="country">Country of Residence</Label>
            <Select value={formData.country} onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select your country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="phone">Telephone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: sanitizeInput(e.target.value, 'text') }))}
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

          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: sanitizeInput(e.target.value, 'text') }))}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating Account...' : 'Sign Up'}
          </Button>
          
          <Button type="button" variant="ghost" className="w-full" onClick={onSwitchToLogin}>
            Already have an account? Sign In
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};