import { Fragment } from 'react';
import { parseRichText } from '@/lib/richText';
import { cn } from '@/lib/utils';

/** Visar text med **fet** och ==röd== märkning (se src/lib/richText.ts). */
export function RichText({ text, className }: { text: string | null | undefined; className?: string }) {
  const lines = parseRichText(text);
  return (
    <span className={cn('whitespace-pre-wrap', className)}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.map((seg, j) => (
            <span
              key={j}
              className={cn(seg.bold && 'font-bold', seg.red && 'text-destructive')}
            >
              {seg.text}
            </span>
          ))}
        </Fragment>
      ))}
    </span>
  );
}