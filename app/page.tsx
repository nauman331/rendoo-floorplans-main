'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'register';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Demo: just navigate to the new project flow
    router.push('/nieuw');
  };

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-rendoo-50 via-white to-rendoo-100 px-4 py-8">
      {/* Decorative floating shapes */}
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-rendoo-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-rendoo-300/30 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 top-0 h-64 w-64 rounded-full bg-rendoo-100/50 blur-3xl" />

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
        {/* Left: Welcome content */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-rendoo-100 px-4 py-1.5 text-xs font-medium text-rendoo-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rendoo-500" />
            Rendoo Floorplans
          </div>
          <h1 className="text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
            Van technische tekening naar{' '}
            <span className="bg-gradient-to-r from-rendoo-600 to-rendoo-400 bg-clip-text text-transparent">
              commerciële plattegrond
            </span>
          </h1>
          <p className="text-base leading-relaxed text-gray-600">
            De Rendoo Floorplans tool helpt jou om technische tekeningen van de architect om te toveren
            naar duidelijke, commerciële plannen — snel, eenvoudig en in jullie eigen huisstijl.
          </p>

          {/* Feature highlights */}
          <div className="space-y-3 pt-2">
            {[
              { icon: '✨', text: 'AI-gestuurde detectie van wooneenheden' },
              { icon: '🎨', text: 'Volledig op maat van jullie branding' },
              { icon: '⚡', text: 'In minuten klaar i.p.v. dagen' },
            ].map((feat) => (
              <div key={feat.text} className="flex items-center gap-3 text-sm text-gray-600">
                <span className="text-lg">{feat.icon}</span>
                {feat.text}
              </div>
            ))}
          </div>

          {/* Help ticket */}
          <div className="mt-8 rounded-2xl border border-rendoo-200 bg-white/60 p-4 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rendoo-100">
                <svg className="h-4 w-4 text-rendoo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-900">Loopt iets vast?</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">
                  Plaats eenvoudig een ticket en iemand van team Rendoo pakt het voor je op.
                </p>
                <a
                  href="mailto:contact@rendoo.studio?subject=Ticket via Rendoo Floorplans"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rendoo-600 hover:text-rendoo-700"
                >
                  Ticket aanmaken
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Login/Register card */}
        <div className="rounded-3xl border border-white/80 bg-white/80 p-8 shadow-2xl shadow-rendoo-200/40 backdrop-blur-xl">
          {/* Tabs */}
          <div className="mb-6 flex gap-2 rounded-full bg-rendoo-50 p-1">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                mode === 'login'
                  ? 'bg-white text-rendoo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Inloggen
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                mode === 'register'
                  ? 'bg-white text-rendoo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Registreren
            </button>
          </div>

          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'login' ? 'Welkom terug 👋' : 'Maak een account aan ✨'}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {mode === 'login' ? 'Log in om aan de slag te gaan' : 'Vul je gegevens in om te starten'}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700">Voornaam</label>
                    <input
                      type="text"
                      placeholder="Jan"
                      className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700">Achternaam</label>
                    <input
                      type="text"
                      placeholder="Janssens"
                      className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700">Bedrijfsnaam</label>
                  <input
                    type="text"
                    placeholder="bv. Vastgoedontwikkeling BVBA"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-700">Adres</label>
                  <input
                    type="text"
                    placeholder="Straat, nummer, postcode, stad"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-medium text-gray-700">E-mailadres</label>
              <input
                type="email"
                placeholder="jij@bedrijf.be"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
              />
            </div>

            {mode === 'login' && (
              <div>
                <label className="block text-[11px] font-medium text-gray-700">Wachtwoord</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-rendoo-400 focus:ring-2 focus:ring-rendoo-100"
                />
              </div>
            )}

            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rendoo-600 to-rendoo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rendoo-300/40 transition-all hover:from-rendoo-700 hover:to-rendoo-600 hover:shadow-xl hover:shadow-rendoo-300/50 active:scale-[0.98]"
            >
              {mode === 'login' ? 'Inloggen' : 'Account aanmaken'}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {mode === 'login' && (
              <>
                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                    <span className="bg-white px-2 text-gray-400">of</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-medium text-gray-700 transition-all hover:border-rendoo-300 hover:bg-rendoo-50"
                >
                  <svg className="h-4 w-4 text-rendoo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Magic login link via e-mail
                </button>
              </>
            )}
          </form>

          {mode === 'login' && (
            <p className="mt-5 text-center text-[11px] text-gray-500">
              Nieuwe gebruiker?{' '}
              <button
                onClick={() => setMode('register')}
                className="font-medium text-rendoo-600 hover:text-rendoo-700"
              >
                Maak hier een account aan
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
