"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useRemote } from "./common";
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [revision, setRevision] = useState(0);
  const health = useRemote<{ connected: boolean }>("/api/health", revision);
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="LexNet home">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden
            >
              <path
                d="M7 7L25 9L17 25L7 7ZM7 7L6 23L17 25"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="7" cy="7" r="3.5" fill="currentColor" />
              <circle cx="25" cy="9" r="3.5" fill="currentColor" />
              <circle cx="17" cy="25" r="3.5" fill="currentColor" />
              <circle cx="6" cy="23" r="2.5" fill="currentColor" />
            </svg>
            <span>
              LexNet<span className="brand-dot">.</span>
            </span>
          </Link>
          <nav aria-label="Main navigation">
            {[
              ["/", "Dictionary"],
              ["/topics", "Topics"],
              ["/developer", "Developer"],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={
                  (
                    href === "/"
                      ? ["/", "/entry", "/concept"].includes(path)
                      : path.startsWith(href)
                  )
                    ? "active"
                    : ""
                }
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            className="connection"
            onClick={() => setRevision((r) => r + 1)}
            title="Check endpoint connection"
          >
            <span
              className={`status-dot ${health.error ? "offline" : health.data ? "online" : "pending"}`}
            />
            <span>
              {health.error
                ? "Endpoint offline"
                : health.data
                  ? "Endpoint connected"
                  : "Connecting…"}
            </span>
          </button>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer>
        <div>
          <strong>LexNet</strong>
          <span>One concept. Many ways to say it.</span>
        </div>
        <span>English · Vietnamese · Chinese</span>
      </footer>
    </>
  );
}
