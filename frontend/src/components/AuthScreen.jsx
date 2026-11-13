import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { readDemoHandoff } from '../lib/demoHandoff';
import { GOOGLE_SIGNIN, signInWithGoogle as startGoogle, signUpAccount } from '../lib/signUp';

const TITLES = {
  login: 'Welcome back',
  signup: 'Create your account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
};

export default function AuthScreen({ mode: initialMode = 'login', onPasswordReset, onBack }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Someone who tried the demo already gave their name there.
  const [displayName, setDisplayName] = useState(() => (initialMode === 'signup' ? readDemoHandoff()?.name ?? '' : ''));
  const [busy, setBusy] = useState(false);
  // Someone who ticked the 13+ and Terms box at the start of the demo is not asked again.
  const demoAgreed = initialMode === 'signup' && Boolean(readDemoHandoff()?.agreed);
  const demoName = initialMode === 'signup' ? readDemoHandoff()?.name ?? '' : '';
  const [ageOk, setAgeOk] = useState(demoAgreed);
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState(null); // { type: 'error' | 'info', text }

  const switchMode = (next) => {
    setMode(next);
    setMessage(null);
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await startGoogle();
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if ((mode === 'signup' || mode === 'reset') && password !== confirm) {
      setMessage({ type: 'error', text: 'The passwords do not match.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    let error = null;

    if (mode === 'login') {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    } else if (mode === 'signup') {
      const res = await signUpAccount({ email, password, displayName });
      error = res.error ?? null;
      if (res.exists) {
        setMessage({ type: 'info', text: 'That email already has an account. Log in instead.' });
        setMode('login');
        setBusy(false);
        return;
      }
      if (res.confirmEmail) {
        setMessage({ type: 'info', text: 'Check your email to confirm your account, then log in.' });
        setMode('login');
      }
    } else if (mode === 'forgot') {
      ({ error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }));
      if (!error) setMessage({ type: 'info', text: 'If that email has an account, a reset link is on its way.' });
    } else if (mode === 'reset') {
      ({ error } = await supabase.auth.updateUser({ password }));
      if (!error) onPasswordReset?.();
    }

    if (error) setMessage({ type: 'error', text: error.message });
    setBusy(false);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        {onBack && <button type="button" className="link-btn auth-back" onClick={onBack}>‹ Back</button>}
        <div className="auth-logo"><MapPin aria-hidden="true" /></div>
        <h1 className="auth-title">{TITLES[mode]}</h1>
        <p className="auth-subtitle">Save places from reels and plan them together.</p>

        {mode === 'signup' && (
          <>
            {!demoName && (
            <label className="field">
              <span className="modal-label">Your name</span>
              <input
                className="step-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What friends call you"
                autoComplete="nickname"
                maxLength={40}
                required
              />
            </label>
            )}
          </>
        )}

        {mode !== 'reset' && (
          <label className="field">
            <span className="modal-label">Email</span>
            <input
              className="step-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </label>
        )}

        {mode !== 'forgot' && (
          <label className="field">
            <span className="modal-label">{mode === 'reset' ? 'New password' : 'Password'}</span>
            <input
              className="step-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </label>
        )}

        {(mode === 'signup' || mode === 'reset') && (
          <label className="field">
            <span className="modal-label">Confirm password</span>
            <input
              className="step-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
        )}

        {mode === 'signup' && !demoAgreed && (
          <label className="auth-agree">
            <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} required />
            <span>
              I'm 13 or older and agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and{' '}
              <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            </span>
          </label>
        )}

        {message && <div className={`auth-message ${message.type}`}>{message.text}</div>}

        <button type="submit" className="step-btn primary full-width" disabled={busy}>
          {busy
            ? <><span className="spinner" aria-hidden="true" />Please wait…</>
            : { login: 'Log in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save password' }[mode]}
        </button>

        {GOOGLE_SIGNIN && (mode === 'login' || mode === 'signup') && (
          <>
            <div className="auth-or" aria-hidden="true">or</div>
            <button type="button" className="step-btn secondary full-width" onClick={signInWithGoogle} disabled={busy}>
              Continue with Google
            </button>
            <p className="toggle-hint">By continuing you confirm you're 13 or older and agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
          </>
        )}

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button type="button" className="link-btn" onClick={() => switchMode('signup')}>
                New here? <strong>Create an account</strong>
              </button>
              <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </>
          )}
          {(mode === 'signup' || mode === 'forgot') && (
            <button type="button" className="link-btn" onClick={() => switchMode('login')}>
              Already have an account? <strong>Log in</strong>
            </button>
          )}
        </div>
        <div className="auth-legal">
          <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
          <a href="/terms" target="_blank" rel="noreferrer">Terms</a>
          <a href="/support" target="_blank" rel="noreferrer">Help</a>
        </div>
      </form>
    </div>
  );
}
