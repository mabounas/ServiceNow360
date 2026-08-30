'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DICT, EMAIL_RE, PHONE_RE, PWD_RE, STATS, type Lang } from './dictionary';
import { IconAlertTriangle, IconKanban, IconLineChart, IconSquareCheck, IconTicket } from './icons';

type Errors = Record<string, string | undefined>;

const CARD_KINDS: ('inc' | 'task')[][] = [
  ['inc', 'task'],
  ['task', 'inc', 'task'],
  ['task'],
];

export default function LandingPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('fr');
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);

  const [login, setLogin] = useState({ email: '', password: '', remember: false });
  const [loginErr, setLoginErr] = useState<Errors>({});
  const [loginDone, setLoginDone] = useState('');

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    phone: '',
    role: '',
    country: '',
    password: '',
    confirm: '',
    cgu: false,
  });
  const [err, setErr] = useState<Errors>({});
  const [signupDone, setSignupDone] = useState('');

  const [contact, setContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    phone: '',
    subject: '',
    message: '',
    website: '', // piège à robots, laissé vide par un humain
  });
  const [contactErr, setContactErr] = useState<Errors>({});
  const [contactDone, setContactDone] = useState('');
  const [contactBusy, setContactBusy] = useState(false);

  const t = DICT[lang];

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '16px 20px',
    background: active ? 'var(--color-accent)' : 'transparent',
    color: active ? 'var(--color-bg)' : 'var(--color-text)',
    border: 0,
    borderRight: '1px solid var(--color-divider)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-heading)',
    fontWeight: 800,
    fontSize: 14,
  });

  const langStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 9px',
    fontSize: 11,
    fontFamily: 'var(--font-heading)',
    fontWeight: 800,
    cursor: 'pointer',
    border: 0,
    background: active ? 'var(--color-accent)' : 'transparent',
    color: active ? 'var(--color-bg)' : 'var(--color-text)',
  });

  async function submitLogin() {
    const d = t.errs;
    const errs: Errors = {};
    if (!login.email.trim()) errs.email = d.required;
    else if (!EMAIL_RE.test(login.email.trim())) errs.email = d.email;
    if (!login.password) errs.password = d.pwdEmpty;
    setLoginErr(errs);
    setLoginDone('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(login),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginErr({ password: data.error ?? 'Connexion impossible.' });
        return;
      }
      setLoginDone(t.login.done);
      router.push('/app');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup() {
    const d = t.errs;
    const errs: Errors = {};
    (['firstName', 'lastName', 'email', 'company', 'phone', 'role', 'country', 'password', 'confirm'] as const).forEach(
      (k) => {
        if (!String(form[k]).trim()) errs[k] = d.required;
      },
    );
    if (!errs.email && !EMAIL_RE.test(form.email.trim())) errs.email = d.email;
    if (!errs.phone && !PHONE_RE.test(form.phone.trim())) errs.phone = d.phone;
    if (!errs.password && !PWD_RE.test(form.password)) errs.password = d.pwd;
    if (!errs.confirm && form.password !== form.confirm) errs.confirm = d.match;
    if (!form.cgu) errs.cgu = d.cgu;
    setErr(errs);
    setSignupDone('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr({ email: data.error ?? 'Inscription impossible.' });
        return;
      }
      setSignupDone(t.signup.done);
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
        phone: '',
        role: '',
        country: '',
        password: '',
        confirm: '',
        cgu: false,
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitContact() {
    const d = t.errs;
    const errs: Errors = {};
    if (!contact.firstName.trim()) errs.firstName = d.required;
    if (!contact.lastName.trim()) errs.lastName = d.required;
    if (!contact.email.trim()) errs.email = d.required;
    else if (!EMAIL_RE.test(contact.email.trim())) errs.email = d.email;
    if (!contact.subject.trim()) errs.subject = d.required;
    if (contact.message.trim().length < 10) errs.message = d.required;
    setContactErr(errs);
    setContactDone('');
    if (Object.keys(errs).length) return;

    setContactBusy(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactErr({ message: data.error ?? 'Envoi impossible.' });
        return;
      }
      setContactDone(t.contact.done);
      setContact({ firstName: '', lastName: '', email: '', company: '', phone: '', subject: '', message: '', website: '' });
    } finally {
      setContactBusy(false);
    }
  }

  const errorLine = (message?: string) =>
    message ? <div style={{ fontSize: 12, color: 'var(--color-accent-700)', marginTop: 5 }}>{message}</div> : null;

  return (
    <div
      style={{
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        minHeight: '100%',
      }}
    >
      <header
        style={{
          borderBottom: '2px solid var(--color-divider)',
          background: 'var(--color-bg)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '14px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            flexWrap: 'wrap',
          }}
        >
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--color-text)' }}>
            <span style={{ width: 18, height: 18, background: 'var(--color-accent)', display: 'block' }} />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
              ServiceDesk360
            </span>
          </a>
          <nav style={{ display: 'flex', gap: 24, marginLeft: 8, flexWrap: 'wrap' }}>
            <a href="#benefices" style={{ fontSize: 13, textDecoration: 'none', color: 'var(--color-text)' }}>{t.nav.produit}</a>
            <a href="#apercu" style={{ fontSize: 13, textDecoration: 'none', color: 'var(--color-text)' }}>{t.nav.solutions}</a>
            <a href="#chiffres" style={{ fontSize: 13, textDecoration: 'none', color: 'var(--color-text)' }}>{t.nav.clients}</a>
            <a href="#contact" style={{ fontSize: 13, textDecoration: 'none', color: 'var(--color-text)' }}>{t.nav.ressources}</a>
          </nav>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', border: '1px solid var(--color-divider)' }}>
              <button type="button" onClick={() => setLang('fr')} style={langStyle(lang === 'fr')}>FR</button>
              <button type="button" onClick={() => setLang('en')} style={langStyle(lang === 'en')}>EN</button>
            </div>
            <a href="#acces" className="btn btn-primary" style={{ textDecoration: 'none' }} onClick={() => setTab('login')}>
              {t.nav.login}
            </a>
          </div>
        </div>
      </header>

      {/* — hero + panneau connexion / inscription — */}
      <section id="top" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
        <div className="landing-hero" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', alignItems: 'stretch' }}>
          <div className="landing-hero-copy" style={{ padding: '64px 56px 64px 0', borderRight: '2px solid var(--color-divider)' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 20 }}>
              {t.hero.kicker}
            </div>
            <h1 style={{ fontSize: 58, lineHeight: 1.02, letterSpacing: '-0.03em', margin: '0 0 24px', maxWidth: '14ch' }}>
              {t.hero.title}
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.5, maxWidth: '52ch', margin: '0 0 32px' }}>{t.hero.sub}</p>
            <hr className="hr" style={{ margin: '0 0 24px' }} />
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[t.hero.b1, t.hero.b2, t.hero.b3].map((item) => (
                <li key={item} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 12, alignItems: 'start', fontSize: 15, lineHeight: 1.45 }}>
                  <span style={{ width: 10, height: 10, background: 'var(--color-accent)', marginTop: 6, display: 'block' }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted" style={{ fontSize: 13, maxWidth: '46ch' }}>{t.hero.note}</p>
          </div>

          <div id="acces" className="landing-hero-panel" style={{ padding: '64px 0 64px 56px' }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid var(--color-divider)' }}>
                <button type="button" onClick={() => setTab('login')} style={tabStyle(tab === 'login')}>{t.panel.tabLogin}</button>
                <button type="button" onClick={() => setTab('signup')} style={tabStyle(tab === 'signup')}>{t.panel.tabSignup}</button>
              </div>

              {tab === 'login' ? (
                <div style={{ padding: '28px 28px 32px' }}>
                  <h3 style={{ fontSize: 22, margin: '0 0 6px' }}>{t.login.title}</h3>
                  <p className="text-muted" style={{ fontSize: 13, margin: '0 0 22px' }}>{t.login.sub}</p>

                  <div className="field" style={{ marginBottom: 16 }}>
                    <label htmlFor="li-email">{t.login.email}</label>
                    <input
                      className="input"
                      id="li-email"
                      type="email"
                      autoComplete="email"
                      value={login.email}
                      onChange={(e) => setLogin({ ...login, email: e.target.value })}
                    />
                    {errorLine(loginErr.email)}
                  </div>

                  <div className="field" style={{ marginBottom: 16 }}>
                    <label htmlFor="li-pwd">{t.login.password}</label>
                    <input
                      className="input"
                      id="li-pwd"
                      type="password"
                      autoComplete="current-password"
                      value={login.password}
                      onChange={(e) => setLogin({ ...login, password: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && submitLogin()}
                    />
                    {errorLine(loginErr.password)}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={login.remember}
                        onChange={(e) => setLogin({ ...login, remember: e.target.checked })}
                        style={{ accentColor: 'var(--color-accent)', width: 15, height: 15 }}
                      />
                      <span>{t.login.remember}</span>
                    </label>
                    <a href="#acces" style={{ fontSize: 13 }}>{t.login.forgot}</a>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={submitLogin}
                    disabled={busy}
                    style={{ marginTop: 0, minHeight: 44, paddingInline: 16 }}
                  >
                    {t.login.cta}
                  </button>

                  {loginDone ? (
                    <div style={{ marginTop: 16, border: '1px solid var(--color-accent)', background: 'var(--color-accent-100)', padding: '12px 14px', fontSize: 13, color: 'var(--color-accent-900)' }}>
                      {loginDone}
                    </div>
                  ) : null}

                  <hr className="hr" style={{ margin: '24px 0 16px' }} />
                  <div style={{ fontSize: 13 }}>
                    <span className="text-muted">{t.login.noAccount} </span>
                    <button type="button" className="btn btn-ghost" onClick={() => setTab('signup')} style={{ fontSize: 13 }}>
                      {t.login.createLink}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '28px 28px 32px' }}>
                  <h3 style={{ fontSize: 22, margin: '0 0 6px' }}>{t.signup.title}</h3>
                  <p className="text-muted" style={{ fontSize: 13, margin: '0 0 22px' }}>{t.signup.sub}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="field">
                      <label htmlFor="su-first">{t.signup.firstName}</label>
                      <input className="input" id="su-first" autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                      {errorLine(err.firstName)}
                    </div>
                    <div className="field">
                      <label htmlFor="su-last">{t.signup.lastName}</label>
                      <input className="input" id="su-last" autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                      {errorLine(err.lastName)}
                    </div>
                    <div className="field" style={{ gridColumn: 'span 2' }}>
                      <label htmlFor="su-email">{t.signup.email}</label>
                      <input className="input" id="su-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      {errorLine(err.email)}
                    </div>
                    <div className="field">
                      <label htmlFor="su-company">{t.signup.company}</label>
                      <input className="input" id="su-company" autoComplete="organization" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                      {errorLine(err.company)}
                    </div>
                    <div className="field">
                      <label htmlFor="su-phone">{t.signup.phone}</label>
                      <input className="input" id="su-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      {errorLine(err.phone)}
                    </div>
                    <div className="field">
                      <label htmlFor="su-role">{t.signup.role}</label>
                      <select className="input" id="su-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ appearance: 'none' }}>
                        <option value="">{t.signup.choose}</option>
                        <option value={t.roleOpts.o1}>{t.roleOpts.o1}</option>
                        <option value={t.roleOpts.o2}>{t.roleOpts.o2}</option>
                        <option value={t.roleOpts.o3}>{t.roleOpts.o3}</option>
                        <option value={t.roleOpts.o4}>{t.roleOpts.o4}</option>
                      </select>
                      {errorLine(err.role)}
                    </div>
                    <div className="field">
                      <label htmlFor="su-country">{t.signup.country}</label>
                      <select className="input" id="su-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={{ appearance: 'none' }}>
                        <option value="">{t.signup.choose}</option>
                        <option value={t.countryOpts.o1}>{t.countryOpts.o1}</option>
                        <option value={t.countryOpts.o2}>{t.countryOpts.o2}</option>
                        <option value={t.countryOpts.o3}>{t.countryOpts.o3}</option>
                        <option value={t.countryOpts.o4}>{t.countryOpts.o4}</option>
                        <option value={t.countryOpts.o5}>{t.countryOpts.o5}</option>
                      </select>
                      {errorLine(err.country)}
                    </div>
                    <div className="field">
                      <label htmlFor="su-pwd">{t.signup.password}</label>
                      <input className="input" id="su-pwd" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      {errorLine(err.password)}
                    </div>
                    <div className="field">
                      <label htmlFor="su-pwd2">{t.signup.confirm}</label>
                      <input className="input" id="su-pwd2" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
                      {errorLine(err.confirm)}
                    </div>
                  </div>

                  <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.5, margin: '10px 0 0' }}>{t.signup.pwdRule}</p>

                  <hr className="hr" style={{ margin: '18px 0' }} />

                  <label style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 10, alignItems: 'start', fontSize: 12, lineHeight: 1.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.cgu}
                      onChange={(e) => setForm({ ...form, cgu: e.target.checked })}
                      style={{ accentColor: 'var(--color-accent)', width: 15, height: 15, marginTop: 2 }}
                    />
                    <span>{t.signup.cgu}</span>
                  </label>
                  {errorLine(err.cgu)}

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={submitSignup}
                    disabled={busy}
                    style={{ minHeight: 44, paddingInline: 16, marginTop: 18 }}
                  >
                    {t.signup.cta}
                  </button>

                  {signupDone ? (
                    <div style={{ marginTop: 16, border: '1px solid var(--color-accent)', background: 'var(--color-accent-100)', padding: '12px 14px', fontSize: 13, color: 'var(--color-accent-900)' }}>
                      {signupDone}
                    </div>
                  ) : null}

                  <hr className="hr" style={{ margin: '24px 0 16px' }} />
                  <div style={{ fontSize: 13 }}>
                    <span className="text-muted">{t.signup.haveAccount} </span>
                    <button type="button" className="btn btn-ghost" onClick={() => setTab('login')} style={{ fontSize: 13 }}>
                      {t.signup.loginLink}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Le hero reste refermé par un filet 2 px (la bande de références a été retirée). */}
      <div style={{ borderTop: '2px solid var(--color-divider)' }} />

      {/* — bénéfices — */}
      <section id="benefices" style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 32px 0' }}>
        <h2 style={{ fontSize: 34, maxWidth: '20ch', margin: '0 0 40px' }}>{t.benefits.title}</h2>
        <div className="landing-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '2px solid var(--color-divider)' }}>
          <div style={{ padding: '32px 32px 32px 0', borderRight: '2px solid var(--color-divider)' }}>
            <IconKanban size={28} style={{ color: 'var(--color-accent)', marginBottom: 18 }} />
            <h3 style={{ fontSize: 20, margin: '0 0 10px' }}>{t.benefits.b1t}</h3>
            <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>{t.benefits.b1d}</p>
          </div>
          <div style={{ padding: 32, borderRight: '2px solid var(--color-divider)' }}>
            <IconTicket size={28} style={{ color: 'var(--color-accent)', marginBottom: 18 }} />
            <h3 style={{ fontSize: 20, margin: '0 0 10px' }}>{t.benefits.b2t}</h3>
            <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>{t.benefits.b2d}</p>
          </div>
          <div style={{ padding: '32px 0 32px 32px' }}>
            <IconLineChart size={28} style={{ color: 'var(--color-accent)', marginBottom: 18 }} />
            <h3 style={{ fontSize: 20, margin: '0 0 10px' }}>{t.benefits.b3t}</h3>
            <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>{t.benefits.b3d}</p>
          </div>
        </div>
      </section>

      {/* — aperçu de l'espace de travail — */}
      <section id="apercu" style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 32px 0' }}>
        <div className="landing-preview" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 48, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 14 }}>
              {t.preview.kicker}
            </div>
            <h2 style={{ fontSize: 30, margin: '0 0 14px' }}>{t.preview.title}</h2>
            <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>{t.preview.sub}</p>
          </div>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', border: '2px solid var(--color-divider)', background: 'var(--color-surface)', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '2px solid var(--color-divider)' }}>
              <span style={{ width: 10, height: 10, background: 'var(--color-accent)', display: 'block' }} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12, letterSpacing: '-0.01em' }}>{t.board.title}</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--color-accent)', color: 'var(--color-bg)', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                <IconAlertTriangle size={12} />
                <span>{t.board.alert}</span>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {CARD_KINDS.map((cards, index) => (
                <div key={index} style={{ padding: 16, borderRight: index < 2 ? '1px solid var(--color-divider)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span className="text-muted" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t.board.cols[index]}</span>
                    <span className="text-muted" style={{ fontSize: 10 }}>{cards.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cards.map((kind, cardIndex) => {
                      const inc = kind === 'inc';
                      return (
                        <div
                          key={cardIndex}
                          style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-divider)',
                            padding: '10px 12px',
                            borderLeft: inc ? '4px solid var(--color-accent)' : undefined,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                            {inc ? (
                              <IconAlertTriangle size={12} style={{ color: 'var(--color-accent)' }} />
                            ) : (
                              <IconSquareCheck size={12} style={{ color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
                            )}
                            <span
                              style={{
                                fontSize: 9,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                fontFamily: 'var(--font-heading)',
                                fontWeight: 800,
                                color: inc ? 'var(--color-accent-700)' : 'color-mix(in srgb, var(--color-text) 55%, transparent)',
                              }}
                            >
                              {inc ? t.board.kinds.inc : t.board.kinds.task}
                            </span>
                          </div>
                          <div style={{ height: 6, width: '88%', background: 'color-mix(in srgb, var(--color-text) 22%, transparent)' }} />
                          <div style={{ height: 6, width: '62%', background: 'color-mix(in srgb, var(--color-text) 12%, transparent)', marginTop: 6 }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* — chiffres clés — */}
      <section id="chiffres" style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 32px 0' }}>
        <div className="landing-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '2px solid var(--color-divider)', borderBottom: '2px solid var(--color-divider)' }}>
          {STATS[lang].map((s) => (
            <div key={s.l} style={{ padding: '32px 24px 32px 0' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 46, lineHeight: 1, letterSpacing: '-0.03em', color: 'var(--color-accent)' }}>
                {s.n}
              </div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 10, maxWidth: '22ch' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* — citation — */}
      <section style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 32px 0' }}>
        <blockquote style={{ margin: 0 }}>
          <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 30, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '0 0 24px', maxWidth: '30ch' }}>
            {t.quote.text}
          </p>
          <footer style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{t.quote.name}</span>
            <span className="text-muted"> — {t.quote.role}</span>
          </footer>
        </blockquote>
      </section>

      {/* — formulaire de contact — */}
      <section id="contact" style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 32px 0' }}>
        <div className="landing-preview" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 48, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginBottom: 14 }}>
              {t.contact.kicker}
            </div>
            <h2 style={{ fontSize: 30, margin: '0 0 14px' }}>{t.contact.title}</h2>
            <p className="text-muted" style={{ fontSize: 14, margin: 0 }}>{t.contact.sub}</p>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 18 }}>{t.contact.note}</p>
          </div>

          <div style={{ border: '2px solid var(--color-divider)', background: 'var(--color-surface)', padding: 28 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label htmlFor="ct-first">{t.contact.firstName}</label>
                <input className="input" id="ct-first" autoComplete="given-name" value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
                {errorLine(contactErr.firstName)}
              </div>
              <div className="field">
                <label htmlFor="ct-last">{t.contact.lastName}</label>
                <input className="input" id="ct-last" autoComplete="family-name" value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} />
                {errorLine(contactErr.lastName)}
              </div>
              <div className="field">
                <label htmlFor="ct-email">{t.contact.email}</label>
                <input className="input" id="ct-email" type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                {errorLine(contactErr.email)}
              </div>
              <div className="field">
                <label htmlFor="ct-phone">{t.contact.phone}</label>
                <input className="input" id="ct-phone" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ct-company">{t.contact.company}</label>
                <input className="input" id="ct-company" autoComplete="organization" value={contact.company} onChange={(e) => setContact({ ...contact, company: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ct-subject">{t.contact.subject}</label>
                <select className="input" id="ct-subject" value={contact.subject} onChange={(e) => setContact({ ...contact, subject: e.target.value })} style={{ appearance: 'none' }}>
                  <option value="">{t.contact.choose}</option>
                  {t.contact.subjects.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
                {errorLine(contactErr.subject)}
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="ct-message">{t.contact.message}</label>
                <textarea className="input" id="ct-message" rows={5} value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} />
                {errorLine(contactErr.message)}
              </div>
            </div>

            {/* Champ leurre : invisible et hors du parcours clavier, seul un robot le remplit. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={contact.website}
              onChange={(e) => setContact({ ...contact, website: e.target.value })}
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            />

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={submitContact}
              disabled={contactBusy}
              style={{ minHeight: 44, paddingInline: 16, marginTop: 18 }}
            >
              {contactBusy ? t.contact.sending : t.contact.cta}
            </button>

            {contactDone ? (
              <div style={{ marginTop: 16, border: '1px solid var(--color-accent)', background: 'var(--color-accent-100)', padding: '12px 14px', fontSize: 13, color: 'var(--color-accent-900)' }}>
                {contactDone}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* — bannière d'appel à l'action — */}
      <section style={{ marginTop: 88, background: 'var(--color-accent)', color: 'var(--color-bg)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 32px' }}>
          <h2 style={{ fontSize: 44, lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 18px', maxWidth: '20ch', color: 'var(--color-bg)' }}>
            {t.banner.title}
          </h2>
          <p style={{ fontSize: 16, maxWidth: '52ch', margin: '0 0 28px', color: 'var(--color-bg)', opacity: 0.9 }}>{t.banner.sub}</p>
          <a
            href="#acces"
            className="btn"
            onClick={() => setTab('signup')}
            style={{ background: 'var(--color-bg)', color: 'var(--color-accent-700)', textDecoration: 'none', minHeight: 44, padding: '12px 20px' }}
          >
            {t.banner.cta}
          </a>
        </div>
      </section>

      <footer style={{ borderTop: '2px solid var(--color-divider)' }}>
        <div className="landing-footer" style={{ maxWidth: 1280, margin: '0 auto', padding: '56px 32px 32px', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ width: 16, height: 16, background: 'var(--color-accent)', display: 'block' }} />
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16 }}>ServiceDesk360</span>
            </div>
            <p className="text-muted" style={{ fontSize: 13, maxWidth: '30ch', margin: 0 }}>{t.footer.blurb}</p>
          </div>
          <div>
            <h6 style={{ marginBottom: 14 }}>{t.footer.c1}</h6>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13 }}>
              <li><a href="#benefices" className="link-plain">{t.footer.c1a}</a></li>
              <li><a href="#apercu" className="link-plain">{t.footer.c1b}</a></li>
              <li><a href="#chiffres" className="link-plain">{t.footer.c1c}</a></li>
            </ul>
          </div>
          <div>
            <h6 style={{ marginBottom: 14 }}>{t.footer.c2}</h6>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13 }}>
              <li><a href="#acces" className="link-plain">{t.footer.c2b}</a></li>
              <li><a href="#contact" className="link-plain">{t.footer.c2c}</a></li>
            </ul>
          </div>
          <div>
            <h6 style={{ marginBottom: 14 }}>{t.footer.c3}</h6>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13 }}>
              <li><a href="#acces" className="link-plain">{t.footer.c3a}</a></li>
              <li><a href="#contact" className="link-plain">{t.footer.c3b}</a></li>
              <li><a href="#acces" className="link-plain">{t.footer.c3c}</a></li>
            </ul>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--color-divider)' }}>
          <div className="text-muted" style={{ maxWidth: 1280, margin: '0 auto', padding: '18px 32px 40px', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
            <span>{t.footer.legal}</span>
            <a href="#acces" style={{ color: 'inherit' }}>{t.footer.l1}</a>
            <a href="#acces" style={{ color: 'inherit' }}>{t.footer.l2}</a>
            <a href="#acces" style={{ color: 'inherit' }}>{t.footer.l3}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
