import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { AVATARS } from '../lib/constants';

const TITLES = {
  login: 'Welcome back',
  signup: 'Create your account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
};

export default function AuthScreen({ mode: initialMode = 'login', onPasswordReset }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'info', text }

  const switchMode = (next) => {
    setMode(next);
    setMessage(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    let error = null;

    if (mode === 'login') {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    } else if (mode === 'signup') {
      const res = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName.trim(), avatar, country: country.trim() } },
      });
      error = res.error;
      // With "Confirm email" switched on, there is no session until the link is clicked.
      if (!error && !res.data.session) {
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
        <div className="auth-logo">🗺️</div>
        <h1 className="auth-title">{TITLES[mode]}</h1>
        <p className="auth-subtitle">Save places from reels and plan them together.</p>

        {mode === 'signup' && (
          <>
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
            <div className="field">
              <span className="modal-label">Avatar</span>
              <div className="avatar-grid" role="radiogroup" aria-label="Avatar">
                {AVATARS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    role="radio"
                    aria-checked={avatar === a}
                    className={`avatar-option ${avatar === a ? 'selected' : ''}`}
                    onClick={() => setAvatar(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="modal-label">Country (optional)</span>
              <input
                className="step-input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Australia"
                autoComplete="country-name"
                maxLength={60}
              />
            </label>
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
              minLength={6}
              required
            />
          </label>
        )}

        {message && <div className={`auth-message ${message.type}`}>{message.text}</div>}

        <button type="submit" className="step-btn primary full-width" disabled={busy}>
          {busy
            ? <><span className="spinner" aria-hidden="true" />Please wait…</>
            : { login: 'Log in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save password' }[mode]}
        </button>

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
      </form>
    </div>
  );
}
