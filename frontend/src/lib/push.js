import { supabase } from './supabase';

// Public half of the VAPID key pair. It is safe to ship in the app.
// The private half lives only in the Supabase function secrets (VAPID_PRIVATE_KEY).
export const VAPID_PUBLIC_KEY = 'BP3dHPcdbIT7LLrzTM3kTBoMr80SAtEJmvkn5y4gXkh2IOQXVD1KIVEL89LXD9DI3HCB5BRtzIgDqf97ZwrWga4';

export const isPushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function getPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

// Asks for permission, subscribes this device, and saves the subscription for the user.
// Returns true on success. Throws a readable message if the browser refuses.
export async function enableFridayPick(userId) {
  if (!isPushSupported()) throw new Error('Notifications are not supported in this browser');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings.');

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' },
  );
  if (error) {
    await subscription.unsubscribe();
    throw new Error(error.message);
  }
  return true;
}

// Removes this device's subscription from the browser and from the database.
export async function disableFridayPick() {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}
