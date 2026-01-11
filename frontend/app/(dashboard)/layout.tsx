import { Sidebar } from '@/components/layout/sidebar';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { BreadcrumbsProvider } from '@/components/layout/breadcrumbs-context';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main id="main-content" className="flex-1 overflow-y-auto">
                <div className="container mx-auto p-8">
                    <BreadcrumbsProvider>
                        <Breadcrumbs />
                        {children}
                    </BreadcrumbsProvider>
                </div>
            </main>
        </div>
    );
}
