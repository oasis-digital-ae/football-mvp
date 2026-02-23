import React, { useState, useMemo } from 'react';
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
import { CheckCircle2, XCircle, Eye, EyeOff, Calendar, Globe, Phone, Mail, User, Lock, Users } from 'lucide-react';

interface SignUpFormProps {
  onSwitchToLogin: () => void;
}

// Country to country code mapping
const COUNTRY_CODES: Record<string, string> = {
  'Afghanistan': '+93', 'Albania': '+355', 'Algeria': '+213', 'Argentina': '+54', 'Australia': '+61',
  'Austria': '+43', 'Bahrain': '+973', 'Bangladesh': '+880', 'Belgium': '+32', 'Brazil': '+55',
  'Bulgaria': '+359', 'Canada': '+1', 'Chile': '+56', 'China': '+86', 'Colombia': '+57',
  'Croatia': '+385', 'Cyprus': '+357', 'Czech Republic': '+420', 'Denmark': '+45', 'Egypt': '+20',
  'Estonia': '+372', 'Finland': '+358', 'France': '+33', 'Germany': '+49', 'Ghana': '+233',
  'Greece': '+30', 'Hong Kong': '+852', 'Hungary': '+36', 'Iceland': '+354', 'India': '+91',
  'Indonesia': '+62', 'Iran': '+98', 'Iraq': '+964', 'Ireland': '+353', 'Israel': '+972',
  'Italy': '+39', 'Japan': '+81', 'Jordan': '+962', 'Kenya': '+254', 'Kuwait': '+965',
  'Lebanon': '+961', 'Malaysia': '+60', 'Mexico': '+52', 'Morocco': '+212', 'Netherlands': '+31',
  'New Zealand': '+64', 'Nigeria': '+234', 'Norway': '+47', 'Oman': '+968', 'Pakistan': '+92',
  'Peru': '+51', 'Philippines': '+63', 'Poland': '+48', 'Portugal': '+351', 'Qatar': '+974',
  'Romania': '+40', 'Russia': '+7', 'Saudi Arabia': '+966', 'Singapore': '+65', 'South Africa': '+27',
  'South Korea': '+82', 'Spain': '+34', 'Sri Lanka': '+94', 'Sweden': '+46', 'Switzerland': '+41',
  'Taiwan': '+886', 'Thailand': '+66', 'Turkey': '+90', 'Ukraine': '+380', 'United Arab Emirates': '+971',
  'United Kingdom': '+44', 'United States': '+1', 'Venezuela': '+58', 'Vietnam': '+84'
};

const COUNTRIES = Object.keys(COUNTRY_CODES).sort();

export const SignUpForm: React.FC<SignUpFormProps> = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    birthday: '',
    country: '',
    phone: '',
    referredBy: ''
  });
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {      // Sanitize firstName and lastName with name type to preserve spaces properly
      const sanitizedFormData = {
        ...formData,
        firstName: sanitizeInput(formData.firstName, 'name'),
        lastName: sanitizeInput(formData.lastName, 'name'),
        referredBy: sanitizeInput(formData.referredBy, 'name')
      };

      // Validate and sanitize form data
      const validation = validateAndSanitize(AppValidators.userRegistration, sanitizedFormData, {
        email: 'email',
        password: 'text',
        firstName: 'text',
        lastName: 'text',
        birthday: 'text',
        country: 'text',
        phone: 'text',
        referredBy: 'text'
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
      
      // Additional validation for age requirement (18+)
      if (sanitizedFormData.birthday) {
        const birthDate = new Date(sanitizedFormData.birthday + 'T00:00:00'); // Add time to avoid timezone issues
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        birthDate.setHours(0, 0, 0, 0);
        
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const dayDiff = today.getDate() - birthDate.getDate();
        
        // Adjust age if birthday hasn't occurred this year
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
          age--;
        }
        
        if (age < 18) {
          setValidationErrors({ birthday: 'Must be 18 years or older to create an account' });
          return;
        }
      }
      
      setLoading(true);
      setValidationErrors({});
        await signUp(validation.data.email, validation.data.password, {
        first_name: validation.data.firstName,
        last_name: validation.data.lastName,
        birthday: validation.data.birthday,
        country: validation.data.country,
        phone: validation.data.phone,
        reffered_by: validation.data.referredBy
      });
      
      toast({
        title: "Account Created Successfully!",
        description: "Please check your email to verify your account. You can sign in after verification.",
        duration: 5000,
      });
        // Clear form after successful signup
      setFormData({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        birthday: '',
        country: '',
        phone: '',
        referredBy: ''
      });
      setValidationErrors({});
    } catch (error: any) {
      if (error instanceof ValidationError) {
        setValidationErrors({ general: error.message });
      } else {
        // Handle Supabase auth errors with better messages
        let errorMessage = error.message || 'An error occurred while creating your account';
        
        // Common Supabase error codes
        if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
          errorMessage = 'This email is already registered. Please sign in instead.';
          setValidationErrors({ email: 'Email already registered' });
        } else if (error.message?.includes('password')) {
          errorMessage = 'Password does not meet requirements. Please use at least 6 characters.';
          setValidationErrors({ password: 'Password must be at least 6 characters' });
        } else if (error.message?.includes('email')) {
          errorMessage = 'Invalid email address. Please check and try again.';
          setValidationErrors({ email: 'Invalid email address' });
        } else {
          setValidationErrors({ general: errorMessage });
        }
        
        toast({
          title: "Account Creation Failed",
          description: errorMessage,
          variant: "destructive",
          duration: 5000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Real-time validation checks
  const validationChecks = useMemo(() => {
    return {
      firstName: {
        isValid: formData.firstName.length >= 2,
        message: formData.firstName.length > 0 && formData.firstName.length < 2 ? 'Must be at least 2 characters' : ''
      },
      lastName: {
        isValid: formData.lastName.length >= 2,
        message: formData.lastName.length > 0 && formData.lastName.length < 2 ? 'Must be at least 2 characters' : ''
      },
      email: {
        isValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email),
        message: formData.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) ? 'Invalid email format' : ''
      },
      password: {
        isValid: formData.password.length >= 6,
        message: formData.password.length > 0 && formData.password.length < 6 ? 'Must be at least 6 characters' : ''
      },
      confirmPassword: {
        isValid: formData.confirmPassword === formData.password && formData.confirmPassword.length > 0,
        message: formData.confirmPassword.length > 0 && formData.confirmPassword !== formData.password ? 'Passwords do not match' : ''
      },
      birthday: {
        isValid: (() => {
          if (!formData.birthday) return false;
          const birthDate = new Date(formData.birthday + 'T00:00:00'); // Add time to avoid timezone issues
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Normalize to start of day
          birthDate.setHours(0, 0, 0, 0);
          
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          const dayDiff = today.getDate() - birthDate.getDate();
          
          // Adjust age if birthday hasn't occurred this year
          if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
            age--;
          }
          
          return age >= 18;
        })(),
        message: ''
      },
      country: {
        isValid: formData.country.length > 0,
        message: ''
      },      phone: {
        isValid: formData.phone.length >= 5,
        message: formData.phone.length > 0 && formData.phone.length < 5 ? 'Must be at least 5 characters' : ''
      },
      referredBy: {
        isValid: formData.referredBy.trim().length >= 2,
        message: formData.referredBy.length > 0 && formData.referredBy.trim().length < 2 ? 'Must be at least 2 characters' : ''
      }
    };
  }, [formData]);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <Card className="w-full max-w-md mx-auto border-0 shadow-xl">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
        <CardDescription className="text-sm">Join the Premier League trading platform</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {validationErrors.general && (
            <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md">
              {validationErrors.general}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                First Name
              </Label>
              <div className="relative">
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, firstName: e.target.value }));
                    if (validationErrors.firstName) {
                      setValidationErrors(prev => ({ ...prev, firstName: '' }));
                    }
                  }}
                  onBlur={(e) => {
                    const sanitized = sanitizeInput(e.target.value, 'name');
                    if (sanitized !== e.target.value) {
                      setFormData(prev => ({ ...prev, firstName: sanitized }));
                    }
                  }}
                  placeholder="First name"
                  required
                  className={`pr-10 ${validationErrors.firstName ? 'border-red-500 focus:border-red-500' : validationChecks.firstName.isValid && formData.firstName.length > 0 ? 'border-green-500/50' : ''}`}
                />
                {formData.firstName.length > 0 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validationChecks.firstName.isValid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                )}
              </div>
              {validationErrors.firstName && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {validationErrors.firstName}
                </p>
              )}
              {!validationErrors.firstName && validationChecks.firstName.message && (
                <p className="text-xs text-red-400">{validationChecks.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Last Name
              </Label>
              <div className="relative">
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, lastName: e.target.value }));
                    if (validationErrors.lastName) {
                      setValidationErrors(prev => ({ ...prev, lastName: '' }));
                    }
                  }}
                  onBlur={(e) => {
                    const sanitized = sanitizeInput(e.target.value, 'name');
                    if (sanitized !== e.target.value) {
                      setFormData(prev => ({ ...prev, lastName: sanitized }));
                    }
                  }}
                  placeholder="Last name"
                  required
                  className={`pr-10 ${validationErrors.lastName ? 'border-red-500 focus:border-red-500' : validationChecks.lastName.isValid && formData.lastName.length > 0 ? 'border-green-500/50' : ''}`}
                />
                {formData.lastName.length > 0 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {validationChecks.lastName.isValid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                )}
              </div>
              {validationErrors.lastName && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {validationErrors.lastName}
                </p>
              )}
              {!validationErrors.lastName && validationChecks.lastName.message && (
                <p className="text-xs text-red-400">{validationChecks.lastName.message}</p>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Address
            </Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, email: sanitizeInput(e.target.value, 'email') }));
                  if (validationErrors.email) {
                    setValidationErrors(prev => ({ ...prev, email: '' }));
                  }
                }}
                placeholder="your.email@example.com"
                required
                className={`pr-10 ${validationErrors.email ? 'border-red-500 focus:border-red-500' : validationChecks.email.isValid && formData.email.length > 0 ? 'border-green-500/50' : ''}`}
              />
              {formData.email.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {validationChecks.email.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {validationErrors.email && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationErrors.email}
              </p>
            )}
            {!validationErrors.email && validationChecks.email.message && (
              <p className="text-xs text-red-400">{validationChecks.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthday" className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date of Birth
            </Label>
            <div className="relative">
              <Input
                id="birthday"
                type="date"
                value={formData.birthday}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, birthday: e.target.value }));
                  if (validationErrors.birthday) {
                    setValidationErrors(prev => ({ ...prev, birthday: '' }));
                  }
                }}
                max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                required
                className={`pr-10 ${validationErrors.birthday ? 'border-red-500 focus:border-red-500' : validationChecks.birthday.isValid && formData.birthday.length > 0 ? 'border-green-500/50' : ''}`}
              />
              {formData.birthday.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {validationChecks.birthday.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {validationErrors.birthday && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationErrors.birthday}
              </p>
            )}
            {!validationErrors.birthday && !validationChecks.birthday.isValid && formData.birthday.length > 0 && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Must be 18 years or older
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="country" className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Country of Residence
            </Label>
            <Select 
              value={formData.country} 
              onValueChange={(value) => {
                const countryCode = COUNTRY_CODES[value] || '';
                
                // Update phone number with new country code
                let updatedPhone = formData.phone;
                
                if (formData.phone.match(/^\+\d+/)) {
                  // Extract the number part (remove existing country code)
                  const numberPart = formData.phone.replace(/^\+\d+\s*/, '').trim();
                  // Prepend new country code
                  updatedPhone = numberPart ? `${countryCode} ${numberPart}` : countryCode;
                } else if (formData.phone.length === 0) {
                  // If phone is empty, just set the country code
                  updatedPhone = countryCode;
                } else {
                  // If phone has content but no country code, prepend the new one
                  updatedPhone = `${countryCode} ${formData.phone.trim()}`;
                }
                
                setFormData(prev => ({ 
                  ...prev, 
                  country: value,
                  phone: updatedPhone
                }));
                if (validationErrors.country) {
                  setValidationErrors(prev => ({ ...prev, country: '' }));
                }
              }}
            >
              <SelectTrigger className={validationErrors.country ? 'border-red-500 focus:border-red-500' : validationChecks.country.isValid ? 'border-green-500/50' : ''}>
                <SelectValue placeholder="Select your country" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {COUNTRIES.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.country && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationErrors.country}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Phone Number
            </Label>
            <div className="relative">
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  let value = e.target.value;
                  
                  // If country is selected, ensure the correct country code is present
                  if (formData.country) {
                    const countryCode = COUNTRY_CODES[formData.country] || '';
                    
                    // If user is deleting everything, allow it
                    if (value.length === 0) {
                      setFormData(prev => ({ ...prev, phone: '' }));
                      return;
                    }
                    
                    // If value doesn't start with the country code, prepend it
                    if (countryCode && !value.startsWith(countryCode)) {
                      // Remove any existing country code pattern
                      value = value.replace(/^\+\d+\s*/, '');
                      // Prepend the correct country code
                      value = countryCode + (value ? ' ' + value : '');
                    }
                  }
                  
                  // Allow phone number characters including spaces, dashes, parentheses, plus
                  const cleaned = value.replace(/[^\d\s\-+()]/g, '');
                  setFormData(prev => ({ ...prev, phone: cleaned }));
                  if (validationErrors.phone) {
                    setValidationErrors(prev => ({ ...prev, phone: '' }));
                  }
                }}
                placeholder={formData.country ? `${COUNTRY_CODES[formData.country] || '+1'} (555) 123-4567` : '+1 (555) 123-4567'}
                required
                className={`pr-10 ${validationErrors.phone ? 'border-red-500 focus:border-red-500' : validationChecks.phone.isValid && formData.phone.length > 0 ? 'border-green-500/50' : ''}`}
              />
              {formData.phone.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {validationChecks.phone.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {validationErrors.phone && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationErrors.phone}
              </p>
            )}            {!validationErrors.phone && validationChecks.phone.message && (
              <p className="text-xs text-red-400">{validationChecks.phone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="referredBy" className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Who Referred You?
            </Label>
            <div className="relative">
              <Input
                id="referredBy"
                type="text"
                value={formData.referredBy}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, referredBy: e.target.value }));
                  if (validationErrors.referredBy) {
                    setValidationErrors(prev => ({ ...prev, referredBy: '' }));
                  }
                }}
                onBlur={(e) => {
                  const sanitized = sanitizeInput(e.target.value, 'name');
                  if (sanitized !== e.target.value) {
                    setFormData(prev => ({ ...prev, referredBy: sanitized }));
                  }
                }}
                placeholder="Please type a name"
                required
                className={`pr-10 ${validationErrors.referredBy ? 'border-red-500 focus:border-red-500' : validationChecks.referredBy.isValid && formData.referredBy.length > 0 ? 'border-green-500/50' : ''}`}
              />
              {formData.referredBy.length > 0 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {validationChecks.referredBy.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              )}
            </div>
            {validationErrors.referredBy && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationErrors.referredBy}
              </p>
            )}
            {!validationErrors.referredBy && validationChecks.referredBy.message && (
              <p className="text-xs text-red-400">{validationChecks.referredBy.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, password: e.target.value }));
                  if (validationErrors.password) {
                    setValidationErrors(prev => ({ ...prev, password: '' }));
                  }
                }}
                placeholder="Create a strong password"
                required
                className={`pr-10 ${validationErrors.password ? 'border-red-500 focus:border-red-500' : validationChecks.password.isValid && formData.password.length > 0 ? 'border-green-500/50' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {validationErrors.password && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationErrors.password}
              </p>
            )}
            {!validationErrors.password && (
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Password requirements:</p>
                <div className="space-y-0.5 text-xs">
                  <div className={`flex items-center gap-1.5 ${formData.password.length >= 6 ? 'text-green-400' : 'text-gray-500'}`}>
                    {formData.password.length >= 6 ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>At least 6 characters</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, confirmPassword: e.target.value }));
                  if (validationErrors.confirmPassword) {
                    setValidationErrors(prev => ({ ...prev, confirmPassword: '' }));
                  }
                }}
                placeholder="Re-enter your password"
                required
                className={`pr-10 ${validationErrors.confirmPassword ? 'border-red-500 focus:border-red-500' : validationChecks.confirmPassword.isValid && formData.confirmPassword.length > 0 ? 'border-green-500/50' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {validationErrors.confirmPassword && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationErrors.confirmPassword}
              </p>
            )}
            {!validationErrors.confirmPassword && validationChecks.confirmPassword.message && formData.confirmPassword.length > 0 && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                {validationChecks.confirmPassword.message}
              </p>
            )}
            {validationChecks.confirmPassword.isValid && formData.confirmPassword.length > 0 && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Passwords match
              </p>
            )}
          </div>

          <Button 
            type="submit" 
            className="w-full bg-trading-primary hover:bg-trading-primary/90 text-white font-semibold py-2.5" 
            disabled={loading || !Object.values(validationChecks).every(check => check.isValid)}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </Button>
          
          <div className="text-center pt-2">
            <button 
              type="button" 
              onClick={onSwitchToLogin}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Already have an account? <span className="text-trading-primary font-medium">Sign In</span>
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};