import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Globe, Sparkles, Bot, Send, ChevronDown, LogOut, User, Video } from 'lucide-react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import ThemeToggle from '../components/ThemeToggle';
import api, { clearAuth, hasStoredAuth } from '../utils/api';

const Landing = () => {
  const navigate = useNavigate();
  const [onlineCount, setOnlineCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey there! I'm BuddyBot, your UniBuddy assistant powered by Gemini AI. Ask me anything about the app!" }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      if (!hasStoredAuth()) {
        setCheckingAuth(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (res.data.user) {
          setCurrentUser(res.data.user);
        }
      } catch (err) {
        clearAuth();
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const fetchOnlineCount = async () => {
      try {
        const res = await api.get('/stats/online');
        setOnlineCount(res.data.online);
      } catch (err) {
        setOnlineCount(0);
      }
    };
    
    fetchOnlineCount();
    const onlineInterval = setInterval(fetchOnlineCount, 10000);
    
    return () => {
      clearInterval(onlineInterval);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {}
    clearAuth();
    setCurrentUser(null);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;
    
    const userMsg = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      const res = await api.post('/ai/chat', { message: inputMessage, sessionId });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
      setIsTyping(false);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble responding right now. Try again later!" }]);
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 relative overflow-hidden">

      {/* Floating 3D elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl float-animation" />
        <div className="absolute top-40 right-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/4 w-36 h-36 bg-purple-400/20 rounded-full blur-3xl float-animation" style={{ animationDelay: '2s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gradient">UniBuddy</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Online Status - hidden on very small screens */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 glass rounded-full">
              <span className="relative flex h-2 w-2 sm:h-3 sm:w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xs sm:text-sm font-medium">{onlineCount} online</span>
            </div>
            <ThemeToggle />
            
            {/* Show different nav based on auth status */}
            {!checkingAuth && (
              currentUser ? (
                <>
                  {/* Logged in user - mobile optimized */}
                  <div className="flex items-center gap-1 sm:gap-3">
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="flex items-center gap-1 sm:gap-2 p-1.5 sm:px-4 sm:py-2 glass rounded-full hover:bg-purple-500/10 transition-colors"
                    >
                      {currentUser.picture ? (
                        <img src={currentUser.picture} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500 rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        </div>
                      )}
                      <span className="hidden sm:block text-sm font-medium">{currentUser.name?.split(' ')[0]}</span>
                    </button>
                    <button
                      onClick={() => navigate('/rooms')}
                      className="hidden sm:flex items-center gap-2 px-4 py-2 glass rounded-full hover:bg-purple-500/10 transition-colors"
                      title="Video Rooms"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="btn-primary text-xs sm:text-sm px-3 sm:px-6 py-1.5 sm:py-2"
                    >
                      <span className="hidden sm:inline">Dashboard</span>
                      <span className="sm:hidden">Go</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="p-1.5 sm:p-2 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Logout"
                    >
                      <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Not logged in - mobile optimized */}
                  <button
                    onClick={() => navigate('/login')}
                    className="hidden sm:block px-6 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    Login
                  </button>
                  <button
                    onClick={() => navigate('/signup')}
                    className="btn-primary text-xs sm:text-sm px-3 sm:px-6 py-1.5 sm:py-2"
                  >
                    Sign Up
                  </button>
                </>
              )
            )}
          </div>
        </div>
      </header>


      {/* Hero Section */}
      <section className="relative z-10 px-4 sm:px-6 py-12 sm:py-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="space-y-6 sm:space-y-8 slide-in">
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 glass rounded-full">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs sm:text-sm font-medium">Connect with students across the Philippines</span>
              </div>
              
              {/* Online count mobile */}
              <div className="md:hidden flex items-center gap-2 px-3 py-1.5 glass rounded-full w-fit">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium">{onlineCount} online</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tighter leading-none">
                Talk to
                <span className="block text-gradient">Campus Strangers</span>
              </h1>
              
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                Meet and chat with fellow students from universities across Luzon, Visayas, and Mindanao. Anonymous or open—your choice.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                {currentUser ? (
                  <>
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="btn-primary text-base sm:text-lg px-8 sm:px-12 py-3 sm:py-4 w-full sm:w-auto"
                    >
                      Go to Dashboard
                    </button>
                    <button
                      onClick={() => navigate('/matching')}
                      className="px-8 sm:px-12 py-3 sm:py-4 text-base sm:text-lg font-semibold border-2 border-purple-600 dark:border-purple-400 text-purple-600 dark:text-purple-400 rounded-full hover:bg-purple-600 hover:text-white dark:hover:bg-purple-400 dark:hover:text-black transition-all duration-200 w-full sm:w-auto"
                    >
                      Find a Stranger
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => navigate('/signup')}
                      className="btn-primary text-base sm:text-lg px-8 sm:px-12 py-3 sm:py-4 w-full sm:w-auto"
                    >
                      Get Started
                    </button>
                    <button
                      onClick={() => navigate('/login')}
                      className="px-8 sm:px-12 py-3 sm:py-4 text-base sm:text-lg font-semibold border-2 border-purple-600 dark:border-purple-400 text-purple-600 dark:text-purple-400 rounded-full hover:bg-purple-600 hover:text-white dark:hover:bg-purple-400 dark:hover:text-black transition-all duration-200 w-full sm:w-auto"
                    >
                      Login
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Visual - hidden on small mobile */}
            <div className="relative hidden sm:block">
              <div className="relative w-full h-64 sm:h-96 rounded-3xl overflow-hidden glass p-1">
                <div className="w-full h-full rounded-2xl bg-gradient-to-br from-purple-600/20 to-emerald-500/20 flex items-center justify-center">
                  <div className="space-y-4 sm:space-y-6">
                    <div className="flex items-center gap-3 sm:gap-4 glass p-3 sm:p-4 rounded-2xl">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-500 rounded-full" />
                      <div className="flex-1">
                        <div className="h-2 sm:h-3 bg-purple-500/50 rounded-full w-24 sm:w-32 mb-2" />
                        <div className="h-1.5 sm:h-2 bg-purple-500/30 rounded-full w-32 sm:w-48" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 glass p-3 sm:p-4 rounded-2xl ml-6 sm:ml-12">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500 rounded-full" />
                      <div className="flex-1">
                        <div className="h-3 bg-emerald-500/50 rounded-full w-32 mb-2" />
                        <div className="h-2 bg-emerald-500/30 rounded-full w-40" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 py-24 bg-gradient-to-b from-transparent to-purple-100/20 dark:to-zinc-800/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">Why UniBuddy?</h2>
            <p className="text-lg text-muted-foreground">Connect, chat, and make friends across campus boundaries</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass p-8 rounded-3xl card-hover">
              <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center mb-6">
                <Globe className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">All Philippines</h3>
              <p className="text-muted-foreground leading-relaxed">
                Connect with students from major universities across Luzon, Visayas, and Mindanao.
              </p>
            </div>

            <div className="glass p-8 rounded-3xl card-hover">
              <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mb-6">
                <Users className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Your Choice</h3>
              <p className="text-muted-foreground leading-relaxed">
                Toggle between anonymous and profile mode. Share as much or as little as you want.
              </p>
            </div>

            <div className="glass p-8 rounded-3xl card-hover">
              <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center mb-6">
                <MessageCircle className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Real-time Chat</h3>
              <p className="text-muted-foreground leading-relaxed">
                Instant messaging with text, emojis, and image sharing for rich conversations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="relative z-10 px-6 py-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl lg:text-5xl font-bold mb-6">About UniBuddy</h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                UniBuddy is a social platform designed exclusively for Filipino university students. 
                Our mission is to break down campus barriers and help students connect with peers 
                from different universities across the Philippines.
              </p>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Whether you're looking for study buddies, new friends, or just someone to chat with, 
                UniBuddy provides a safe and fun environment to meet fellow students from Luzon, 
                Visayas, and Mindanao.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="glass px-6 py-3 rounded-full">
                  <span className="text-2xl font-bold text-gradient">300+</span>
                  <span className="text-muted-foreground ml-2">Universities</span>
                </div>
                <div className="glass px-6 py-3 rounded-full">
                  <span className="text-2xl font-bold text-gradient">3</span>
                  <span className="text-muted-foreground ml-2">Regions</span>
                </div>
              </div>
            </div>
            <div className="glass p-8 rounded-3xl">
              <h3 className="text-xl font-bold mb-4">Our Values</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <i className="bi bi-shield-lock text-white text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-semibold">Privacy First</h4>
                    <p className="text-sm text-muted-foreground">Your identity is protected with anonymous mode</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <i className="bi bi-people text-white text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-semibold">Safe Community</h4>
                    <p className="text-sm text-muted-foreground">We promote respectful and positive interactions</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <i className="bi bi-mortarboard text-white text-sm"></i>
                  </div>
                  <div>
                    <h4 className="font-semibold">Student Focused</h4>
                    <p className="text-sm text-muted-foreground">Built by students, for students</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works / Guide */}
      <section id="guide" className="relative z-10 px-6 py-24 bg-gradient-to-b from-transparent to-purple-100/20 dark:to-zinc-800/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-muted-foreground">Get started in just a few simple steps</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Sign Up', desc: 'Create your account with Google or email in seconds', icon: 'bi-pencil-square' },
              { step: '2', title: 'Set Profile', desc: 'Choose your region and university to find nearby students', icon: 'bi-bullseye' },
              { step: '3', title: 'Find Match', desc: 'Click "Find a Stranger" to connect with someone random', icon: 'bi-search' },
              { step: '4', title: 'Start Chatting', desc: 'Chat instantly! Toggle anonymous mode anytime', icon: 'bi-chat-dots' },
            ].map((item) => (
              <div key={item.step} className="glass p-6 rounded-2xl text-center card-hover">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                  {item.step}
                </div>
                <div className="text-3xl mb-3"><i className={`bi ${item.icon} text-purple-600 dark:text-purple-400`}></i></div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-4">FAQ</h2>
            <p className="text-lg text-muted-foreground">Frequently asked questions</p>
          </div>
          <div className="space-y-4">
            {[
              { q: 'Is UniBuddy free to use?', a: 'Yes! UniBuddy is completely free for all Filipino university students.' },
              { q: 'How does anonymous mode work?', a: 'When enabled, your name and profile picture are hidden from other users. You can chat freely without revealing your identity.' },
              { q: 'Can I choose who I match with?', a: 'Matching is random within your selected region and university. This encourages meeting new people you might not otherwise connect with!' },
              { q: 'Is my data safe?', a: 'We take privacy seriously. Your personal information is encrypted and never shared with third parties.' },
              { q: 'What are Video Rooms?', a: 'Video Rooms let you create or join video/voice calls with password protection, screen sharing, and invite links.' },
              { q: 'Can I use UniBuddy on mobile?', a: 'Yes! UniBuddy is fully responsive and works great on mobile browsers.' },
            ].map((item, i) => (
              <div key={i} className="glass p-6 rounded-2xl">
                <h3 className="font-bold text-lg mb-2">{item.q}</h3>
                <p className="text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Developer */}
      <section id="developer" className="relative z-10 px-6 py-24 bg-gradient-to-b from-transparent to-purple-100/20 dark:to-zinc-800/20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl lg:text-5xl font-bold mb-8">Meet the Developer</h2>
          <div className="glass p-8 rounded-3xl inline-block">
            <div className="w-32 h-32 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="bi bi-code-slash text-white text-5xl"></i>
            </div>
            <h3 className="text-2xl font-bold mb-2">Vincent Bernabe Romeo</h3>
            <p className="text-purple-600 dark:text-purple-400 font-medium mb-4">aka "Daisukie"</p>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              A passionate developer dedicated to creating meaningful connections among Filipino students 
              through technology. UniBuddy is built with love for the student community.
            </p>
            <div className="flex justify-center gap-4">
              <span className="glass px-4 py-2 rounded-full text-sm">React</span>
              <span className="glass px-4 py-2 rounded-full text-sm">Node.js</span>
              <span className="glass px-4 py-2 rounded-full text-sm">MongoDB</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass p-12 rounded-3xl">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6">Ready to connect?</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join thousands of students already making new friends
            </p>
            <button
              onClick={() => navigate(currentUser ? '/matching' : '/signup')}
              className="btn-secondary text-lg px-12 py-4"
            >
              {currentUser ? 'Start Matching' : 'Start Chatting Now'}
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-12 border-t border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-xl flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gradient">UniBuddy</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Connecting Filipino university students across the nation.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#about" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#guide" className="hover:text-foreground transition-colors">How It Works</a></li>
                <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
                <li><a href="#developer" className="hover:text-foreground transition-colors">Developer</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Features</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Random Matching</li>
                <li>Anonymous Mode</li>
                <li>Video Rooms</li>
                <li>Real-time Chat</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Regions</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Luzon</li>
                <li>Visayas</li>
                <li>Mindanao</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/50 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © 2024 UniBuddy. Made with <i className="bi bi-heart-fill text-purple-500"></i> by Vincent Bernabe Romeo (Daisukie)
            </p>
            <p className="text-sm text-muted-foreground">
              For Filipino Students, By Filipino Students
            </p>
          </div>
        </div>
      </footer>

      {/* AI Chat Assistant */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        {!chatOpen ? (
          <button
            onClick={() => setChatOpen(true)}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          >
            <Bot className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
          </button>
        ) : (
          <div className="fixed inset-4 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-96 sm:h-[500px] glass rounded-3xl flex flex-col overflow-hidden shadow-2xl">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-purple-600 to-emerald-500 p-3 sm:p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm sm:text-base">BuddyBot</h3>
                  <p className="text-xs text-white/80">AI Assistant</p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-white/80 hover:text-white p-1">
                <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl ${
                    msg.role === 'user' 
                      ? 'bg-purple-600 text-white rounded-br-md' 
                      : 'bg-zinc-200 dark:bg-zinc-700 text-foreground rounded-bl-md'
                  }`}>
                    <p className="text-sm whitespace-pre-line">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-zinc-200 dark:bg-zinc-700 p-3 rounded-2xl rounded-bl-md">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Ask me anything..."
                  className="flex-1 px-4 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 border-none focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                />
                <button
                  onClick={sendMessage}
                  className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors"
                >
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Landing;
