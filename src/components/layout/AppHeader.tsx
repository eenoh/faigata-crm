// src/components/layout/AppHeader.tsx
"use client";

import type React from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  BellIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { useSidebar } from "@/context/SidebarContext";
import { supabase } from "@/lib/supabaseClient";

function getSectionName(pathname: string): string {
  if (pathname.startsWith("/leads/new")) return "Add Leads";
  if (pathname.startsWith("/leads")) return "Leads";
  if (pathname.startsWith("/pipeline")) return "Pipeline";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  return "FaigataCRM";
}

type HeaderUser = {
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
  role: string | null;
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { collapsed } = useSidebar();

  const section = getSectionName(pathname);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement | null>(null);

  const leftClass = collapsed ? "left-16" : "left-64";

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Turn stored avatar path into a signed URL (or use legacy full URL)
  async function refreshAvatar(path: string | null) {
    if (!path) {
      setAvatarUrl(null);
      return;
    }

    if (path.startsWith("http://") || path.startsWith("https://")) {
      setAvatarUrl(path);
      return;
    }

    const { data, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24);

    if (error) {
      console.error("[Header] createSignedUrl error", error);
      setAvatarUrl(null);
      return;
    }

    setAvatarUrl(data?.signedUrl ?? null);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userRes, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userRes.user) {
          if (!cancelled) {
            setUser(null);
            setAvatarUrl(null);
            setLoadingUser(false);
          }
          return;
        }

        const userId = userRes.user.id;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url, role")
          .eq("id", userId)
          .single();

        if (profileError) {
          console.error("[Header] Failed to load profile", profileError);
          if (!cancelled) {
            setUser({
              firstName: null,
              lastName: null,
              avatarPath: null,
              role: null,
            });
            setAvatarUrl(null);
          }
        } else if (!cancelled) {
          const headerUser: HeaderUser = {
            firstName: profile?.first_name ?? null,
            lastName: profile?.last_name ?? null,
            avatarPath: profile?.avatar_url ?? null,
            role: profile?.role ?? null,
          };
          setUser(headerUser);
          if (headerUser.avatarPath) {
            refreshAvatar(headerUser.avatarPath);
          }
        }
      } catch (err) {
        console.error("[Header] Failed to load user/profile", err);
        if (!cancelled) {
          setUser(null);
          setAvatarUrl(null);
        }
      } finally {
        if (!cancelled) setLoadingUser(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close profile menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }

    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen]);

  // Close on route change
  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);

    if (!pathname.startsWith("/leads") && !pathname.startsWith("/pipeline")) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());

    if (value.trim()) {
      params.set("q", value.trim());
    } else {
      params.delete("q");
    }

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;

    router.replace(url);
  }

  const initials = (() => {
    if (!user) return "U";
    const first = user.firstName?.trim()?.charAt(0).toUpperCase();
    const last = user.lastName?.trim()?.charAt(0).toUpperCase();
    if (first && last) return `${first}${last}`;
    if (first) return first;
    if (last) return last;
    return "U";
  })();

  const displayName =
    user && (user.firstName || user.lastName)
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : "You";

  const displayRole = (() => {
    const raw = user?.role;
    if (!raw) return "Member";

    switch (raw.toLowerCase()) {
      case "prospector":
        return "Prospector";
      case "setter":
        return "Setter";
      case "closer":
        return "Closer";
      case "manager":
        return "Manager";
      case "admin":
        return "Admin";
      default:
        return raw;
    }
  })();

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Header] signOut error", err);
    } finally {
      router.replace("/login");
    }
  }

  return (
    <header
      className={`
        fixed top-0 right-0 ${leftClass}
        z-20 flex items-center justify-between
        border-b border-slate-200
        bg-white/80 px-6 py-3
        backdrop-blur transition-all duration-300
      `}
    >
      <div className="flex flex-col">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">
          FaigataCRM
        </span>
        <span className="text-sm font-semibold text-slate-900">
          {section}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-400 focus-within:ring-2 focus-within:ring-indigo-500">
          <MagnifyingGlassIcon className="h-4 w-4" />
          <input
            type="text"
            placeholder="Search leads, companies…"
            className="w-40 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        <button
          type="button"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition cursor-pointer"
          aria-label="Notifications"
        >
          <BellIcon className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </button>

        {/* Profile area with click-to-open menu */}
        <div ref={profileRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex items-center gap-2 cursor-pointer"
          >
            {loadingUser ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
            ) : avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                {initials}
              </div>
            )}

            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-medium text-slate-900 cursor-pointer">
                {displayName}
              </span>
              <span className="text-[11px] text-slate-400 cursor-pointer">
                {displayRole}
              </span>
            </div>
          </button>

          {/* Dropdown menu */}
          {!loadingUser && (
            <div
              className={`
                absolute right-0 top-9 mt-2 w-44
                rounded-xl border border-slate-200 bg-white shadow-lg
                transition-all duration-150 ease-out origin-top-right
                ${
                  profileOpen
                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                    : "opacity-0 translate-y-1 scale-95 pointer-events-none"
                }
              `}
            >
              <div className="px-3 pt-2 pb-1 text-xs text-slate-500">
                <p className="font-medium text-slate-900">
                  {displayName}
                </p>
                <p className="text-[11px] text-slate-400">
                  {displayRole}
                </p>
              </div>
              <div className="border-t border-slate-100 px-3 py-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
                >
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
