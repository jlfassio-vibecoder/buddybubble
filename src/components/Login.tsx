import React from 'react';
import { auth, googleProvider, signInWithPopup } from '../firebase';
import { LogIn } from 'lucide-react';
import { motion } from 'motion/react';

export const Login: React.FC = () => {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center border border-slate-100"
      >
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-6 shadow-lg shadow-indigo-200">
          TS
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">Welcome to TeamSync</h1>
        <p className="text-slate-500 mb-8">A unified workspace for your team's communication and planning.</p>
        
        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 hover:border-indigo-100 transition-all group shadow-sm"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          <span>Sign in with Google</span>
          <LogIn className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
        </button>
        
        <p className="mt-8 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          Securely powered by Firebase
        </p>
      </motion.div>
    </div>
  );
};
