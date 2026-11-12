import React, { useState } from 'react';
import AuthScreen from './AuthScreen';
import Landing from './Landing';
import { hasAccountHere } from '../lib/demoHandoff';
import { pendingInvite } from '../lib/share';
import { firstView } from '../lib/firstView';

// The Demo is loaded only when someone taps Try it now, so it adds nothing to the first page.
const Demo = React.lazy(() => import('../demo/Demo'));

export default function LoggedOut({ sharedPlace = false }) {
  const [view, setView] = useState(() => firstView({ sharedPlace, invited: Boolean(pendingInvite()), knownDevice: hasAccountHere() }));

  if (view === 'demo') {
    return (
      <React.Suspense fallback={<div className="center-screen"><span className="spinner" aria-hidden="true" />Loading…</div>}>
        <Demo onExit={() => setView('landing')} onSignUp={() => setView('signup')} onLogin={() => setView('login')} />
      </React.Suspense>
    );
  }
  if (view === 'landing') {
    return <Landing onTry={() => setView('demo')} onSignUp={() => setView('signup')} onLogin={() => setView('login')} />;
  }
  return <AuthScreen mode={view} onBack={view === 'login' && hasAccountHere() ? undefined : () => setView('landing')} />;
}
