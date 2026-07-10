import { useContext } from 'react';
import { Tk } from '../shared';

// Large title + descriptive subtitle, the way the iPad shell's own pages
// (Library, Source, Search, Settings) introduce themselves — replaces the
// small kicker+24px header each of those borrows from the phone layout
// (suppressed there via the `inline` prop) since a tablet has the width to
// spare for real hierarchy instead of a compact label. `action` is an
// optional right-aligned slot (e.g. Library's refresh button).
export default function TabletPageHeader({ title, subtitle, action }) {
  const { C } = useContext(Tk);
  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div className="min-w-0">
        <h1 className="text-[34px] font-semibold leading-tight truncate"
          style={{ color: C.text1, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && (
          <p className="text-[15px] mt-1.5" style={{ color: C.text4 }}>{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </div>
  );
}
