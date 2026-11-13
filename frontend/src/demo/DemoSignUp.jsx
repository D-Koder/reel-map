import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_SIGNIN, signInWithGoogle, signUpAccount } from '../lib/signUp';

// The sign-up form on the demo's end card, so the person claims their badge without leaving the page.
// It asks only for what is missing: a name if they did not give one on the first screen, then email and password.
// The 13+ and Terms tick was already done on the first screen, and the country comes from the phone's region.
export default function DemoSignUp({ name, onBack, onLogin, beforeSubmit }) {
  const [who, setWho] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'info', text, login?: true }
  const root = useRef(null);

  useEffect(() => { root.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, []);

  const google = async () => {
    setBusy(true);
    setMessage(null);
    beforeSubmit();
    const { error } = await signInWithGoogle();
    if (error) { setMessage({ type: 'error', text: error.message }); setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name && !who.trim()) return setMessage({ type: 'error', text: 'Add your name.' });
    if (password.length < 8) return setMessage({ type: 'error', text: 'Use at least 8 characters for the password.' });
    if (password !== confirm) return setMessage({ type: 'error', text: 'The passwords do not match.' });
    setBusy(true);
    setMessage(null);
    beforeSubmit();
    const res = await signUpAccount({ email: email.trim(), password, displayName: name || who });
    setBusy(false);
    if (res.error) setMessage({ type: 'error', text: res.error.message });
    else if (res.exists) setMessage({ type: 'info', text: 'That email already has an account. Log in instead.', login: true });
    else if (res.confirmEmail) setMessage({ type: 'info', text: 'Check your email to confirm your account, then log in. Your badge will be waiting.', login: true });
    // Signed in: the app takes over from here and Test Driver celebrates once it opens.
  };

  return (
    <form className="dsu" onSubmit={submit} ref={root}>
      <h3 className="dsu-title">Create your free account to keep it</h3>
      {GOOGLE_SIGNIN && (
        <>
          <button type="button" className="demo-btn dsu-google" onClick={google} disabled={busy}>Continue with Google</button>
          <div className="dsu-or" aria-hidden="true">or</div>
        </>
      )}
      {!name && <input className="demo-input" value={who} maxLength={40} placeholder="Your name" aria-label="Your name" autoComplete="given-name" onChange={(e) => setWho(e.target.value)} />}
      <input className="demo-input" type="email" value={email} placeholder="you@example.com" aria-label="Email" autoComplete="email" inputMode="email" required onChange={(e) => setEmail(e.target.value)} />
      <input className="demo-input" type="password" value={password} placeholder="Password" aria-label="Password" autoComplete="new-password" required onChange={(e) => setPassword(e.target.value)} />
      <input className="demo-input" type="password" value={confirm} placeholder="Confirm password" aria-label="Confirm password" autoComplete="new-password" required onChange={(e) => setConfirm(e.target.value)} />
      {message && (
        <div className={`dsu-msg ${message.type}`} role="alert">
          {message.text}
          {message.login && <button type="button" className="demo-link" onClick={onLogin}>Log in</button>}
        </div>
      )}
      <button type="submit" className="demo-btn go dsu-submit" disabled={busy}>{busy ? 'Please wait…' : 'Create account & claim'}</button>
      <button type="button" className="demo-link" onClick={onBack} disabled={busy}>Not now</button>
    </form>
  );
}
