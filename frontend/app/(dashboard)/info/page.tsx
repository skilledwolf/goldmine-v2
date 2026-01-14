'use client';

import { useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs-context';

const SECTIONS = [
  { id: 'purpose', title: 'Purpose & Access' },
  { id: 'why', title: 'Why the Gold Mine' },
  { id: 'semester', title: 'During the Semester' },
  { id: 'prep', title: 'Preparing Exercise Sheets' },
  { id: 'standards', title: 'Standards & Contents' },
  { id: 'ethuebung', title: 'ethuebung Package' },
  { id: 'faq', title: 'FAQ (LaTeX & sheets)' },
] as const;

export default function InfoIndexPage() {
  const crumbs = useMemo(
    () => [
      { label: 'Dashboard', href: '/' },
      { label: 'Info', href: '/info', isCurrent: true },
    ],
    [],
  );
  useBreadcrumbs(crumbs);

  useEffect(() => {
    document.title = 'Info · Gold Mine V2';
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="border-b border-border/50 pb-6">
        <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Documentation</p>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
          Info & help
        </h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl">
          Key guidance for using the Gold Mine and the ethuebung LaTeX package.
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-[250px_1fr] items-start">
        <div className="hidden lg:block sticky top-6">
          <div className="rounded-xl border border-primary/10 bg-card/50 p-4 backdrop-blur-sm">
            <h3 className="font-semibold text-sm mb-3 px-2">On this page</h3>
            <nav className="flex flex-col space-y-1">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="min-w-0">
          <Card className="border-none shadow-none bg-transparent">
            <CardContent className="p-0">
              <div className="prose prose-zinc dark:prose-invert max-w-none 
                        prose-headings:scroll-mt-24 
                        prose-h2:text-3xl prose-h2:font-extrabold prose-h2:tracking-tight prose-h2:text-primary prose-h2:mb-6 prose-h2:mt-16 first:prose-h2:mt-0
                        prose-p:text-base prose-p:leading-7 prose-p:text-muted-foreground
                        prose-ul:text-base prose-ul:leading-7 prose-ul:text-muted-foreground
                        prose-li:my-2
                        prose-a:text-foreground prose-a:underline prose-a:decoration-primary/50 prose-a:underline-offset-4 hover:prose-a:decoration-primary hover:prose-a:text-primary
                        prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                        prose-lead:text-lg prose-lead:text-foreground/80 prose-lead:font-medium
                     ">
                <section id="purpose">
                  <h2>Purpose &amp; Access</h2>
                  <p>
                    The Gold Mine is an archive of exercises for reuse in future ITP courses. It is intended for teaching
                    staff and invited assistants. By contributing, you agree that your material may be recycled for later
                    courses; avoid uploading sensitive content you do not want reused.
                  </p>
                </section>

                <section id="why">
                  <h2>Why the Gold Mine?</h2>
                  <p>
                    Historically, exercise sheets were scattered, often missing sources or solutions. The Gold Mine provides
                    a central, complete archive (PDFs + LaTeX) to cut down redundant work and make reuse simple.
                  </p>
                </section>

                <section id="semester">
                  <h2>During the semester</h2>
                  <p>
                    Assistants can collaborate however they like (shared drives, git, etc.). Keep a consistent folder with
                    TeX, PDFs, solutions, and figures that compiles cleanly. Gold Mine integration happens after the
                    semester when files are placed under the lecture’s media root.
                  </p>
                </section>

                <section id="prep">
                  <h2>Preparing exercise sheets</h2>
                  <ul>
                    <li>Reuse past exercises when possible: search the archive or browse by lecture/semester.</li>
                    <li>Prefer the <code>ethuebung</code> template (see below) to ease later parsing and maintain consistency.</li>
                    <li>
                      Keep files up-to-date and compilable with <code>pdflatex</code>. Use sensible, consistent naming for sheets,
                      solutions, and figures.
                    </li>
                    <li>Add keywords via <code>\\keywords&#123;...&#125;</code> in TeX; they improve search.</li>
                  </ul>
                </section>

                <section id="standards">
                  <h2>Standards &amp; contents</h2>
                  <ul>
                    <li>Archive should contain exercise PDFs (required) and, if available, LaTeX sources and solution PDFs.</li>
                    <li>Include figures and any auxiliary material needed to compile or understand the sheet.</li>
                    <li>Exclude lecture notes/scripts; they belong on the course site.</li>
                    <li>Non-weekly sheets (midterms, revision sheets) are welcome.</li>
                  </ul>
                </section>

                <section id="ethuebung">
                  <h2>The <code>ethuebung</code> LaTeX package</h2>
                  <p className="lead">
                    Official ETH ITP style for exercise + solutions in one file. Generates both sheets, numbers exercises and
                    parts, supports inline solutions, tips sheets, PDF attachments for handwritten solutions, and keywords.
                  </p>
                  <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
                    <a
                      href="/ethuebung.zip"
                      download
                      className="flex flex-col items-center justify-center p-6 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-center group"
                    >
                      <span className="text-2xl mb-2 group-hover:-translate-y-1 transition-transform">📦</span>
                      <span className="font-semibold">Download ZIP</span>
                      <span className="text-xs text-muted-foreground mt-1">Local snapshot</span>
                    </a>
                    <a
                      href="https://github.com/phfaist/ethuebung"
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col items-center justify-center p-6 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-center group"
                    >
                      <span className="text-2xl mb-2 group-hover:-translate-y-1 transition-transform">🐙</span>
                      <span className="font-semibold">GitHub Repository</span>
                      <span className="text-xs text-muted-foreground mt-1">Latest version & docs</span>
                    </a>
                  </div>
                </section>

                <section id="faq">
                  <h2>FAQ (selected from legacy)</h2>
                  <div className="not-prose space-y-4">
                    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
                      <h3 className="text-base font-semibold mb-2">How do I generate solutions?</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Write solutions inside <code>\\begin&#123;solution&#125;...\\end&#123;solution&#125;</code>. Compile with
                        <code>[sol]</code> package option or the helper scripts (see manual) to produce a solutions PDF.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
                      <h3 className="text-base font-semibold mb-2">Can I attach scanned handwritten solutions?</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">Yes, with <code>\\pdfloesung&#123;solution.pdf&#125;</code> (added at the end of the solutions PDF).</p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
                      <h3 className="text-base font-semibold mb-2">German sheets?</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">Use <code>\\UebungLanguage&#123;Deutsch&#125;</code> before <code>\\begin&#123;document&#125;</code>.</p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm">
                      <h3 className="text-base font-semibold mb-2">Can I modify the style file?</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Keep a single canonical <code>ethuebung.sty</code>. Customize via commands in your TeX file; if you need
                        changes, contribute upstream instead of editing the style directly.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
