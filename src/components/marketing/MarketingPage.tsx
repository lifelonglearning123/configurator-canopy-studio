'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import './marketing.css';

const BOOK_URL = 'https://connect.artificialignorance.io/widget/bookings/15-min-phone-call-w-oliver';
const CONFIGURATOR_URL = '/index.html';
const CONTACT_EMAIL = 'oliver@artificialignorance.io';

export function MarketingPage() {
  const navRef = useRef<HTMLElement>(null);
  const quoteCardRef = useRef<HTMLDivElement>(null);
  const priceCounterRef = useRef<HTMLDivElement>(null);
  const lcQuoteRef = useRef<HTMLDivElement>(null);
  const lcTimeRef = useRef<HTMLSpanElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  /* mobile menu toggle */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const btn = nav.querySelector('.menu-btn');
    const close = () => nav.classList.remove('open');
    const toggle = () => nav.classList.toggle('open');
    btn?.addEventListener('click', toggle);
    const links = nav.querySelectorAll('.nav-links a');
    links.forEach(a => a.addEventListener('click', close));
    return () => {
      btn?.removeEventListener('click', toggle);
      links.forEach(a => a.removeEventListener('click', close));
    };
  }, []);

  /* scroll reveal */
  useEffect(() => {
    const reveals = document.querySelectorAll<HTMLElement>('.ai-marketing .reveal');
    const io = new IntersectionObserver(
      es => {
        es.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* animated price counter — fires when the quote card scrolls into view */
  useEffect(() => {
    const card = quoteCardRef.current;
    if (!card) return;
    const target = 14820;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const fmt = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

    let counted = false;
    const runCount = () => {
      if (counted) return;
      counted = true;
      if (reduce) {
        if (priceCounterRef.current) priceCounterRef.current.textContent = fmt(target);
        if (lcQuoteRef.current) lcQuoteRef.current.textContent = fmt(target);
        return;
      }
      const dur = 1800;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        const v = target * e;
        if (priceCounterRef.current) priceCounterRef.current.textContent = fmt(v);
        if (lcQuoteRef.current) lcQuoteRef.current.textContent = fmt(v);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) runCount(); }),
      { threshold: 0.5 }
    );
    io.observe(card);
    return () => io.disconnect();
  }, []);

  /* "now" ticker for the notification card */
  useEffect(() => {
    let sec = 0;
    const id = setInterval(() => {
      sec++;
      const el = lcTimeRef.current;
      if (!el) return;
      if (sec < 60) el.textContent = sec + 's ago';
      else if (sec < 3600) el.textContent = Math.floor(sec / 60) + 'm ago';
      else el.textContent = 'now';
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function onSubmitContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (String(fd.get('website') || '')) return; // honeypot

    const payload = {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      company: String(fd.get('company') || '').trim(),
      product: String(fd.get('product') || ''),
      message: String(fd.get('message') || '').trim(),
    };
    if (!payload.name || !payload.email) {
      setResult({ kind: 'err', msg: 'Please add your name and email.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setResult({ kind: 'err', msg: 'Please enter a valid email address.' });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again or email ' + CONTACT_EMAIL + '.');
      setResult({ kind: 'ok', msg: 'Thanks — we’ve got your message. Oliver will be in touch within one working day.' });
      form.reset();
    } catch (err) {
      setResult({ kind: 'err', msg: err instanceof Error ? err.message : 'Something went wrong. Try again or email ' + CONTACT_EMAIL + '.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ai-marketing">
      {/* UTILITY BAR */}
      <div className="utility">
        <div className="utility-in">
          <span><span className="dot" /> Verandas · Carports · Garden rooms · Pergolas</span>
          <span className="hide-sm">Go live in 7 days · £49 / mo</span>
        </div>
      </div>

      {/* NAV */}
      <header className="nav" id="nav" ref={navRef}>
        <div className="nav-in">
          <a className="brand" href="#top" aria-label="Artificial Ignorance home">
            <span className="brand-mark"><span>AI</span></span>
            <span>Artificial Ignorance</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#configurator">Configurator</a>
            <a href="#quality">Quality</a>
            <a href="#email">The email</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="nav-cta">
            <a href="#configurator" className="btn btn-ghost">Try it live</a>
            <a href={BOOK_URL} target="_blank" rel="noopener" className="btn btn-primary">Book a demo <span className="arr">›</span></a>
            <button className="menu-btn" id="menuBtn" aria-label="Menu"><span /></button>
          </div>
        </div>
      </header>

      <a id="top" />

      {/* HERO */}
      <section className="hero wrap">
        <div className="reveal">
          <span className="eyebrow">3D Configurator · for outdoor-living sellers</span>
        </div>
        <h1 className="reveal" data-delay="1">Show products in 3D and generate quotes in <span className="hl">seconds.</span></h1>
        <p className="lead reveal" data-delay="2">Stop spending time on sketches and quote preparation. Let your customers do this themselves while you focus on closing deals. Choose our premade 3D configurator and go live in 7 days.</p>
        <div className="hero-cta reveal" data-delay="3">
          <a href={BOOK_URL} target="_blank" rel="noopener" className="btn btn-primary">Book a demo <span className="arr">›</span></a>
          <a href="#configurator" className="btn btn-ghost">See it live <span className="arr">›</span></a>
        </div>
        <div className="hero-meta-row reveal" data-delay="4">
          <span><b>Photoreal 3D</b> · not toy graphics</span>
          <span className="sep">·</span>
          <span><b>Live pricing</b> as buyers build</span>
          <span className="sep">·</span>
          <span><b>Real-time email</b> when they request the quote</span>
        </div>
      </section>

      {/* CONFIGURATOR SHOWCASE */}
      <section id="configurator" className="wrap" style={{ paddingBottom: 'clamp(64px,9vw,140px)' }}>
        <div className="showcase reveal">
          <div className="showcase-frame">
            <iframe src={CONFIGURATOR_URL} title="Live 3D veranda configurator" loading="lazy" allow="fullscreen; xr-spatial-tracking" />
          </div>
          <div className="showcase-caption">
            <span><span className="dot" /> Live. Try the buyer experience for yourself.</span>
            <a href={CONFIGURATOR_URL} target="_blank" rel="noopener" className="link-more">Open full screen</a>
          </div>
        </div>
      </section>

      {/* QUALITY */}
      <section id="quality" className="section bg-dark">
        <div className="wrap-narrow center">
          <span className="eyebrow reveal">Photoreal — not toy 3D</span>
          <h2 className="reveal" data-delay="1" style={{ marginTop: 14 }}>A different class of 3D from anything else in outdoor living.</h2>
          <p className="lead center reveal" data-delay="2" style={{ marginTop: 22, maxWidth: '54ch' }}>Studio-grade lighting. Real materials. Every angle a marketing shot. The buyer doesn’t see a 3D widget — they see their veranda.</p>
        </div>
        <div className="wrap">
          <div className="stats">
            <div className="stat reveal">
              <div className="n">60<span className="unit">fps</span></div>
              <h4>Smooth on every device</h4>
              <p>Engineered to render at full quality on a four-year-old phone. No app install required.</p>
            </div>
            <div className="stat reveal" data-delay="1">
              <div className="n">4K</div>
              <h4>Studio-grade renders</h4>
              <p>Real shadows, real reflections, real depth. Looks like a photograph, not a cartoon model.</p>
            </div>
            <div className="stat reveal" data-delay="2">
              <div className="n">360<span className="unit">°</span></div>
              <h4>Every angle, walk inside</h4>
              <p>Buyers orbit, zoom and look up at the louvres — including the view from inside looking out.</p>
            </div>
            <div className="stat reveal" data-delay="3">
              <div className="n">4</div>
              <h4>Product families</h4>
              <p>Verandas, carports, garden rooms and pergolas — one configurator, your full range.</p>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE PRICING */}
      <section className="section">
        <div className="wrap">
          <div className="feature-grid">
            <div className="feature-text reveal">
              <span className="eyebrow">Live pricing</span>
              <h2>They build it. They see the price as they go.</h2>
              <p className="lead">Every roof, every wall, every finish, every add-on updates the price in real time. By the time your buyer requests the formal quote, they’ve already designed the product and agreed the budget — in their own head, in their own time.</p>
              <a href="#configurator" className="link-more" style={{ marginTop: 24, display: 'inline-flex' }}>Try the buyer flow</a>
            </div>
            <div className="feature-visual reveal" data-delay="1">
              <div className="lead-card" ref={quoteCardRef}>
                <div className="lead-card-top">
                  <div className="left"><span className="dot" /> Configuring · live</div>
                  <div className="right">Sample buyer build</div>
                </div>
                <div className="lc-block">
                  <div className="lc-label">Product</div>
                  <div className="lc-name">Pergola Lux. · Free-standing</div>
                  <div className="lc-spec" style={{ marginTop: 8 }}>
                    <span><b className="tabular">5.00 × 3.50 m</b> · Anthracite aluminium</span>
                    <span>Louvred retractable roof</span>
                    <span>2× sliding glass walls · LED · heating · install</span>
                  </div>
                </div>
                <div className="lc-block">
                  <div className="lc-label">Live price · ex. VAT</div>
                  <div className="lc-price">
                    <div className="v tabular" ref={priceCounterRef}>£0</div>
                    <small>Built by the buyer<br /><b style={{ color: 'var(--ai-ink)', fontWeight: 500 }}>in 41 seconds</b></small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EMAIL */}
      <section id="email" className="section bg-2">
        <div className="wrap">
          <div className="feature-grid flip">
            <div className="feature-text reveal">
              <span className="eyebrow">Real-time email</span>
              <h2>The lead lands in your <span className="hl">inbox</span>. The moment they ask.</h2>
              <p className="lead">When the buyer requests the formal quote, the configurator emails you the full lead in seconds — name, phone, the exact spec, the price they’ve designed against, and the PDF attached. No dashboard. No CRM. Just your inbox.</p>
              <a href="#pricing" className="link-more" style={{ marginTop: 24, display: 'inline-flex' }}>See pricing</a>
            </div>
            <div className="feature-visual reveal" data-delay="1">
              <div className="notif-stack">
                <div className="notif">
                  <div className="notif-ico"><span>AI</span></div>
                  <div>
                    <div className="notif-meta"><b>Mail</b><span ref={lcTimeRef}>now</span></div>
                    <div className="notif-title">New quote · Sarah Kowalski · £14,820</div>
                    <div className="notif-body">Pergola Lux. 5×3.5m anthracite alu, louvred retractable roof, 2× sliding glass walls. Call: +44 7700 900 042</div>
                  </div>
                </div>
                <div className="lead-card">
                  <div className="lead-card-top">
                    <div className="left"><span className="dot" /> Lead detail</div>
                    <div className="right">From your configurator</div>
                  </div>
                  <div className="lc-block">
                    <div className="lc-label">Buyer</div>
                    <div className="lc-name">Sarah Kowalski</div>
                    <div className="lc-contact">
                      <span>sarah.k@example.co.uk</span>
                      <span className="tabular">+44 7700 900 042</span>
                      <span>London W4 · UK</span>
                    </div>
                  </div>
                  <div className="lc-block">
                    <div className="lc-label">Configured</div>
                    <div className="lc-spec">
                      <span><b>Pergola Lux.</b> · Free-standing</span>
                      <span><b className="tabular">5.00 × 3.50m</b> · Anthracite aluminium</span>
                      <span>Louvred retractable roof · 2× sliding glass</span>
                      <span>LED · heating · full install</span>
                    </div>
                  </div>
                  <div className="lc-block">
                    <div className="lc-label">Their price · ex. VAT</div>
                    <div className="lc-price">
                      <div className="v tabular" ref={lcQuoteRef}>£14,820</div>
                      <small>Built by the buyer<br /><b style={{ color: 'var(--ai-ink)', fontWeight: 500 }}>PDF attached</b></small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY OURS */}
      <section className="section">
        <div className="wrap-narrow center">
          <span className="eyebrow reveal">Why ours</span>
          <h2 className="reveal" data-delay="1" style={{ marginTop: 14 }}>Designed to look like the real thing.</h2>
          <p className="lead center reveal" data-delay="2" style={{ marginTop: 22, maxWidth: '56ch' }}>Most veranda configurators on the market look like cardboard cutouts. Ours behaves like the camera in a product photoshoot — and renders smoothly on every device.</p>
        </div>
        <div className="wrap">
          <div className="specs">
            <div className="spec reveal">
              <h4>Photoreal</h4>
              <p>Studio-grade renders, not toy graphics. Real shadows, real reflections, real depth.</p>
            </div>
            <div className="spec reveal" data-delay="1">
              <h4>True materials</h4>
              <p>Aluminium reflects. Glass refracts. Every finish behaves the way it would in reality.</p>
            </div>
            <div className="spec reveal" data-delay="2">
              <h4>Every angle</h4>
              <p>Orbit, walk inside, look up at the louvres. No fixed cameras, no flat product shots.</p>
            </div>
            <div className="spec reveal" data-delay="3">
              <h4>Runs anywhere</h4>
              <p>60fps on a four-year-old phone, no app install. Design from the sofa or the back garden.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 7 DAYS */}
      <section className="section bg-3" id="how">
        <div className="wrap-narrow center">
          <span className="eyebrow reveal">Onboarding</span>
          <h2 className="reveal" data-delay="1" style={{ marginTop: 14 }}>Live on your website in <span className="hl">7 days.</span></h2>
          <p className="lead center reveal" data-delay="2" style={{ marginTop: 22, maxWidth: '54ch' }}>Three stages, no developers required. Send us your range and we hand you back a configurator embedded under your branding.</p>
        </div>
        <div className="wrap">
          <div className="steps">
            <div className="step reveal">
              <div className="step-n">1</div>
              <h3>Send us your range</h3>
              <p>Share your verandas, carports, garden rooms and pergolas — products, options, finishes, dimensions and pricing.</p>
            </div>
            <div className="step reveal" data-delay="1">
              <div className="step-n">2</div>
              <h3>We set up under your brand</h3>
              <p>Configurator, branding, domain, lead email destination — wired up and tested while you carry on selling.</p>
            </div>
            <div className="step reveal" data-delay="2">
              <div className="step-n">3</div>
              <h3>Embed and go live</h3>
              <p>One snippet of code on your site. Buyers start designing. Leads start arriving in your inbox. Done in seven days.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="section">
        <div className="wrap-narrow center">
          <span className="eyebrow reveal">Pricing</span>
          <h2 className="reveal" data-delay="1" style={{ marginTop: 14 }}>One configurator. One price.</h2>
          <p className="lead center reveal" data-delay="2" style={{ marginTop: 22 }}>Unlimited buyer designs. Unlimited lead emails. Cancel any time.</p>
        </div>
        <div className="wrap">
          <div className="pricing-card reveal" data-delay="3">
            <span className="tag">Most popular</span>
            <div className="price tabular">£49<span className="per">per month, per reseller</span></div>
            <p className="summary">A photoreal 3D configurator on your website — designing verandas, carports, garden rooms and pergolas — emailing every lead in real time.</p>
            <ul>
              <li><span>Photoreal 3D — studio-grade renders</span></li>
              <li><span>Verandas · carports · garden rooms · pergolas</span></li>
              <li><span>Your branding, your domain, your range</span></li>
              <li><span>Live pricing as buyers build</span></li>
              <li><span>Unlimited buyer designs &amp; quotes</span></li>
              <li><span>Real-time lead emails — name, phone, spec, price</span></li>
              <li><span>PDF quote attached to every email</span></li>
              <li><span>Desktop, tablet &amp; mobile — 60fps</span></li>
            </ul>
            <div className="cta-row">
              <a href="/sign-up" className="btn btn-primary">Start free trial <span className="arr">›</span></a>
              <a href={BOOK_URL} target="_blank" rel="noopener" className="btn btn-ghost">Book your demo</a>
            </div>
            <p className="note">14-day free trial · cancel any time · go live in 7 days</p>
          </div>
          <p className="partners reveal">Running a network of dealers or installers? <a href={BOOK_URL} target="_blank" rel="noopener">Talk to us about white-label partnerships</a>.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section bg-3">
        <div className="wrap-narrow center">
          <span className="eyebrow reveal">FAQ</span>
          <h2 className="reveal" data-delay="1" style={{ marginTop: 14 }}>Questions, answered.</h2>
        </div>
        <div className="wrap">
          <div className="faq reveal" data-delay="2">
            <details open><summary>What do I actually get for £49 a month?<span className="pm" /></summary><div className="ans">A photoreal 3D configurator, embedded on your website under your branding, that lets your buyers design and price a veranda, carport, garden room or pergola. Every time a buyer asks for the formal quote, the lead arrives as an email in your inbox in real time — with their name, phone, the exact spec, and the price. Unlimited designs, unlimited emails. That’s the whole product.</div></details>
            <details><summary>How is your 3D different from competitor configurators?<span className="pm" /></summary><div className="ans">Most veranda configurators look like cardboard cutouts — flat colours, fake shadows, the same generic SketchUp model with your logo on it. Ours is genuinely photoreal: studio-grade lighting, real material physics, smooth on every device. The buyer doesn’t see a 3D widget. They see their veranda. That’s what closes the sale.</div></details>
            <details><summary>Which products does the configurator cover?<span className="pm" /></summary><div className="ans">Verandas, carports, garden rooms and pergolas — all four product categories run on the same engine. You send us your range and we model each variation under your branding, with your finishes, dimensions and pricing built in.</div></details>
            <details><summary>How does the lead actually arrive?<span className="pm" /></summary><div className="ans">As a normal email, in your inbox, in real time. The buyer fills in their name, email and phone to receive the PDF quote. The same moment they hit “send”, you get a structured copy of the lead — contact details, the full spec they designed, the price they accepted, and the PDF attached. No dashboard, no CRM, no waiting.</div></details>
            <details><summary>Can I put it on my own website with my own branding?<span className="pm" /></summary><div className="ans">Absolutely. The configurator runs under your name, logo, colours and domain. Buyers think they’re using your software — because it is yours to use. We never appear in front of your customer.</div></details>
            <details><summary>Does it really work on mobile without dropping quality?<span className="pm" /></summary><div className="ans">Yes. The renderer is engineered to hit 60fps on a four-year-old phone without an app install. Buyers get the same photoreal experience on the train, on the sofa or stood in the back garden imagining where the veranda will go.</div></details>
            <details><summary>How fast can I be live and getting lead emails?<span className="pm" /></summary><div className="ans">Seven days. Once you send your products, options and pricing, we set everything up under your brand and hand it back ready to drop on your website. Most veranda sellers are getting their first lead emails within a week.</div></details>
          </div>
        </div>
      </section>

      {/* CONTACT FORM */}
      <section className="section bg-2" id="contact">
        <div className="wrap-narrow center">
          <span className="eyebrow reveal">Get in touch</span>
          <h2 className="reveal" data-delay="1" style={{ marginTop: 14 }}>Send us a message.</h2>
          <p className="lead center reveal" data-delay="2" style={{ marginTop: 22 }}>
            Tell us about your range and we’ll be back in touch within one working day. Prefer a call? <a href="#demo" className="link-more" style={{ display: 'inline-flex' }}>Book a 15-min slot</a>.
          </p>
        </div>
        <div className="wrap" style={{ maxWidth: 720, margin: '0 auto' }}>
          <form className={`contact-form reveal${submitting ? ' loading' : ''}`} data-delay="3" onSubmit={onSubmitContact} noValidate>
            <div className="cf-row">
              <div className="cf-field">
                <label htmlFor="cf-name">Name<span className="req">*</span></label>
                <input type="text" id="cf-name" name="name" required autoComplete="name" placeholder="Your full name" />
              </div>
              <div className="cf-field">
                <label htmlFor="cf-email">Email<span className="req">*</span></label>
                <input type="email" id="cf-email" name="email" required autoComplete="email" placeholder="you@yourbrand.com" />
              </div>
            </div>
            <div className="cf-row">
              <div className="cf-field">
                <label htmlFor="cf-phone">Phone</label>
                <input type="tel" id="cf-phone" name="phone" autoComplete="tel" placeholder="+44 7700 900 000" />
              </div>
              <div className="cf-field">
                <label htmlFor="cf-company">Business name</label>
                <input type="text" id="cf-company" name="company" autoComplete="organization" placeholder="Your company" />
              </div>
            </div>
            <div className="cf-field">
              <label htmlFor="cf-product">Which product line?</label>
              <select id="cf-product" name="product" defaultValue="">
                <option value="">Choose one (optional)</option>
                <option value="Verandas">Verandas</option>
                <option value="Carports">Carports</option>
                <option value="Garden rooms">Garden rooms</option>
                <option value="Pergolas">Pergolas</option>
                <option value="Multiple">All / multiple categories</option>
              </select>
            </div>
            <div className="cf-field">
              <label htmlFor="cf-message">Message</label>
              <textarea id="cf-message" name="message" rows={4} placeholder="Tell us about your range, your website, or your question." />
            </div>
            <div className="cf-honey" aria-hidden="true">
              <label htmlFor="cf-website">Don’t fill this</label>
              <input type="text" id="cf-website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="cf-foot">
              <p className="cf-note">We’ll only use these details to follow up about Artificial Ignorance. No newsletters, no sharing.</p>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Sending…' : <>Send message <span className="arr">›</span></>}
              </button>
            </div>
            {result && <div className={`cf-result ${result.kind}`}>{result.msg}</div>}
          </form>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="section bg-dark" id="demo">
        <div className="wrap final">
          <span className="eyebrow reveal">Take action</span>
          <h2 className="reveal" data-delay="1" style={{ marginTop: 14 }}>Stop losing buyers who can’t picture it.</h2>
          <p className="lead center reveal" data-delay="2">Book a free 15-minute call with Oliver. We’ll plug your veranda, carport, garden room or pergola range into a test configurator and show you exactly what the email looks like when a buyer hits send.</p>
          <div className="final-cta reveal" data-delay="3">
            <a href={BOOK_URL} target="_blank" rel="noopener" className="btn btn-primary">Book a 15-min call <span className="arr">›</span></a>
            <a href="#configurator" className="btn btn-ghost">See the buyer flow <span className="arr">›</span></a>
          </div>

          <div className="book reveal" data-delay="4" id="book">
            <div className="book-head">
              <h3>15-minute call with Oliver</h3>
              <p>UK / worldwide · free · no obligation</p>
            </div>
            <div className="book-frame">
              <iframe src={BOOK_URL} title="Book a 15-minute call with Oliver" id="booking_15min" loading="lazy" />
            </div>
            <p className="book-fallback">Calendar not loading? <a href={BOOK_URL} target="_blank" rel="noopener">Open the booking page →</a></p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="foot">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="brand" href="#top" style={{ color: 'var(--ai-ink)' }}>
                <span className="brand-mark"><span>AI</span></span>
                <span>Artificial Ignorance</span>
              </a>
              <p>3D configurator studio for outdoor-living sellers. We build photoreal configurators that let your buyers design and price their veranda, carport, garden room or pergola — and email the lead straight to your inbox.</p>
            </div>
            <div className="foot-col">
              <h5>Product</h5>
              <a href="#configurator">3D Configurator</a>
              <a href="#quality">Photoreal quality</a>
              <a href="#email">Real-time email</a>
              <a href="#how">How it works</a>
            </div>
            <div className="foot-col">
              <h5>Company</h5>
              <a href="#pricing">Pricing</a>
              <a href="#pricing">Partners</a>
              <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
            </div>
            <div className="foot-col">
              <h5>Get started</h5>
              <a href="#demo">Book a demo</a>
              <a href="#configurator">Try it live</a>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© {new Date().getFullYear()} Artificial Ignorance Ltd — Company No. 16414035</span>
            <span>artificialignorance.io</span>
          </div>
        </div>
      </footer>

      {/* GHL booking embed script */}
      <Script src="https://link.msgsndr.com/js/form_embed.js" strategy="lazyOnload" />
    </div>
  );
}
