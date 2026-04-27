"use client";

import { useState, useEffect, useTransition } from "react";
import { subscribePush, unsubscribePush } from "@/actions/push.actions";
import { Bell, BellOff } from "lucide-react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushToggle() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !!VAPID_PUBLIC_KEY;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      // Check if already subscribed
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  async function handleToggle() {
    if (!isSupported) return;

    startTransition(async () => {
      const reg = await navigator.serviceWorker.ready;

      if (isSubscribed) {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribePush(sub.endpoint);
          await sub.unsubscribe();
        }
        setIsSubscribed(false);
      } else {
        // Subscribe
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
        });

        const keys = sub.toJSON().keys;
        if (!keys?.p256dh || !keys?.auth) return;

        const result = await subscribePush({
          endpoint: sub.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        });

        if (result.success) {
          setIsSubscribed(true);
        }
      }
    });
  }

  if (!isSupported) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={isPending || permission === "denied"}
      className="flex items-center justify-between w-full rounded-lg border border-[var(--border-default)] p-[var(--space-3)]"
    >
      <div className="flex items-center gap-[var(--space-2)]">
        {isSubscribed ? <Bell size={20} /> : <BellOff size={20} />}
        <div className="text-left">
          <span className="text-body">Push Notifications</span>
          {permission === "denied" && (
            <p className="text-meta text-[var(--text-secondary)]">
              Blocked in browser settings
            </p>
          )}
        </div>
      </div>
      <div
        className={`relative w-[44px] h-[24px] rounded-full transition-colors ${
          isSubscribed ? "bg-[var(--color-info)]" : "bg-[var(--border-default)]"
        }`}
      >
        <div
          className={`absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white transition-transform ${
            isSubscribed ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
      </div>
    </button>
  );
}
