'use client';

import { useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Documentation</p>
        <h1 className="text-3xl font-bold tracking-tight">Info</h1>
        <p className="text-sm text-muted-foreground">
          Key guidance for using the Gold Mine and the ethuebung LaTeX package.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>On this page</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-input bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {s.title}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none py-6 prose-h2:mt-0 prose-h2:text-lg prose-h3:text-base prose-p:text-[15px] prose-li:text-[15px] prose-ul:list-disc prose-ol:list-decimal prose-headings:font-semibold prose-headings:text-foreground">
          <div className="space-y-6">
            <section id="purpose" className="scroll-mt-10 space-y-2 border-t pt-6 first:border-t-0 first:pt-0">
              <h2>Purpose &amp; Access</h2>
              <p>
                The Gold Mine is an archive of exercises for reuse in future ITP courses. It is intended for teaching
                staff and invited assistants. By contributing, you agree that your material may be recycled for later
                courses; avoid uploading sensitive content you do not want reused.
              </p>
            </section>

            <section id="why" className="scroll-mt-10 space-y-2 border-t pt-6">
              <h2>Why the Gold Mine?</h2>
              <p>
                Historically, exercise sheets were scattered, often missing sources or solutions. The Gold Mine provides
                a central, complete archive (PDFs + LaTeX) to cut down redundant work and make reuse simple.
              </p>
            </section>

            <section id="semester" className="scroll-mt-10 space-y-2 border-t pt-6">
              <h2>During the semester</h2>
              <p>
                Assistants can collaborate however they like (shared drives, git, etc.). Keep a consistent folder with
                TeX, PDFs, solutions, and figures that compiles cleanly. Gold Mine integration happens after the
                semester when files are placed under the lecture’s media root.
              </p>
            </section>

            <section id="prep" className="scroll-mt-10 space-y-2 border-t pt-6">
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

            <section id="standards" className="scroll-mt-10 space-y-2 border-t pt-6">
              <h2>Standards &amp; contents</h2>
              <ul>
                <li>Archive should contain exercise PDFs (required) and, if available, LaTeX sources and solution PDFs.</li>
                <li>Include figures and any auxiliary material needed to compile or understand the sheet.</li>
                <li>Exclude lecture notes/scripts; they belong on the course site.</li>
                <li>Non-weekly sheets (midterms, revision sheets) are welcome.</li>
              </ul>
            </section>

            <section id="ethuebung" className="scroll-mt-10 space-y-2 border-t pt-6">
              <h2>The <code>ethuebung</code> LaTeX package</h2>
              <p>
                Official ETH ITP style for exercise + solutions in one file. Generates both sheets, numbers exercises and
                parts, supports inline solutions, tips sheets, PDF attachments for handwritten solutions, and keywords.
              </p>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
                <div className="font-semibold text-foreground">Downloads</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Local snapshot (zip):{' '}
                    <a
                      className="text-primary underline-offset-2 hover:underline"
                      href="/ethuebung.zip"
                      download
                    >
                      ethuebung.zip
                    </a>
                  </li>
                  <li>
                    GitHub repo (latest):{' '}
                    <a
                  className="text-primary underline-offset-2 hover:underline"
                  href="https://github.com/phfaist/ethuebung"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/phfaist/ethuebung
                </a>
              </li>
                </ul>
              </div>
            </section>

            <section id="faq" className="scroll-mt-10 border-t pt-6 space-y-4">
              <h2>FAQ (selected from legacy)</h2>
              <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
                <h3 className="text-base font-semibold">How do I generate solutions?</h3>
                <p className="text-[15px]">
                  Write solutions inside <code>\\begin&#123;solution&#125;...\\end&#123;solution&#125;</code>. Compile with
                  <code>[sol]</code> package option or the helper scripts (see manual) to produce a solutions PDF.
                </p>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
                <h3 className="text-base font-semibold">Can I attach scanned handwritten solutions?</h3>
                <p className="text-[15px]">Yes, with <code>\\pdfloesung&#123;solution.pdf&#125;</code> (added at the end of the solutions PDF).</p>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
                <h3 className="text-base font-semibold">German sheets?</h3>
                <p className="text-[15px]">Use <code>\\UebungLanguage&#123;Deutsch&#125;</code> before <code>\\begin&#123;document&#125;</code>.</p>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
                <h3 className="text-base font-semibold">Can I modify the style file?</h3>
                <p className="text-[15px]">
                  Keep a single canonical <code>ethuebung.sty</code>. Customize via commands in your TeX file; if you need
                  changes, contribute upstream instead of editing the style directly.
                </p>
              </div>
            </section>

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
