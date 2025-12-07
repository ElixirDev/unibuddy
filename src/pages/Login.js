import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowLeft, Home } from 'lucide-react';
import { toast } from 'sonner';
import api, { saveAuthToken } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
          callback: handleGoogleCallback
        });
        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-btn'),
          { theme: 'outline', size: 'large', width: '100%', text: 'continue_with' }
        );
      }
    };

    return () => {
      document.body.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleCallback = async (response) => {
    try {
      const result = await api.post('/auth/google', {
        credential: response.credential
      });
      if (result.data.user) {
        if (result.data.token) saveAuthToken(result.data.token);
        toast.success('Welcome back!');
        sessionStorage.setItem('just_authenticated', 'true');
        navigate('/dashboard', { state: { user: result.data.user }, replace: true });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Google login failed');
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post('/auth/login', formData);
      if (response.data.user) {
        if (response.data.token) saveAuthToken(response.data.token);
        toast.success('Welcome back!');
        sessionStorage.setItem('just_authenticated', 'true');
        navigate('/dashboard', { state: { user: response.data.user }, replace: true });
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl float-animation" />
        <div className="absolute bottom-20 left-20 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }} />
      </div>

      {/* Top Navigation */}
      <div className="absolute top-6 left-6 z-20 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2 glass rounded-full hover:bg-purple-500/10 transition-colors"
          title="Go Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => navigate('/')}
          className="p-2 glass rounded-full hover:bg-purple-500/10 transition-colors"
          title="Go Home"
        >
          <Home className="w-5 h-5" />
        </button>
      </div>
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="glass p-8 rounded-3xl slide-in">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-2 text-gradient">Welcome Back</h1>
              <p className="text-muted-foreground">Login to continue chatting</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" data-testid="login-form">
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    name="email"
                    data-testid="email-input"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="you@university.edu"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="password"
                    name="password"
                    data-testid="password-input"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                data-testid="login-submit-btn"
                disabled={loading}
                className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
            </form>

            <div className="my-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div id="google-signin-btn" className="flex justify-center"></div>

            <p className="text-center mt-6 text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-purple-600 dark:text-purple-400 font-medium hover:underline" data-testid="signup-link">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
