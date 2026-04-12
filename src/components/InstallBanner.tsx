"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

export function InstallBanner() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        // Check if user has already dismissed the banner in this session
        const dismissed = sessionStorage.getItem("pwa-banner-dismissed");
        if (dismissed) {
            setIsDismissed(true);
            return;
        }

        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            // Update UI notify the user they can install the PWA
            setIsVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        // Check if already installed
        if (window.matchMedia("(display-mode: standalone)").matches) {
            setIsVisible(false);
        }

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === "accepted") {
            console.log("User accepted the install prompt");
        } else {
            console.log("User dismissed the install prompt");
        }

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
        setIsVisible(false);
    };

    const handleDismiss = () => {
        setIsVisible(false);
        setIsDismissed(true);
        sessionStorage.setItem("pwa-banner-dismissed", "true");
    };

    if (!isVisible || isDismissed) return null;

    return (
        <div className="w-full max-w-4xl mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="relative overflow-hidden rounded-2xl bg-indigo-600 p-6 shadow-lg ring-1 ring-inset ring-white/10">
                {/* Decorative background element */}
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
                <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl"></div>
                
                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                            <Download className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Install Volatile FF</h3>
                            <p className="text-sm text-indigo-100">
                                Add to your home screen for a faster, app-like experience with offline access.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleInstallClick}
                            className="flex-1 sm:flex-none rounded-lg bg-white px-6 py-2.5 text-sm font-bold text-indigo-600 shadow-sm hover:bg-indigo-50 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-600"
                        >
                            Install Now
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="rounded-lg p-2 text-indigo-200 hover:bg-white/10 hover:text-white transition-colors"
                            aria-label="Dismiss"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
