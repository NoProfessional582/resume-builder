import { Card, PageHeader } from '../components/ui';

export function ComingSoon({ title, milestone, description }: { title: string; milestone: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="text-sm text-slate-600">
          <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{milestone}</span>
          {description}
        </p>
      </Card>
    </>
  );
}
