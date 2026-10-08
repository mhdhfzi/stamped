import { useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, Globe, Plus, X } from 'lucide-react';
import type { RegionFilter, Trip } from '../types';
import { useStore } from '../store';
import { REGIONS, regionOf } from '../data/countries';
import { photoSrc } from '../lib/photoSrc';
import { DestinationCard } from '../components/DestinationCard';
import { CardStack } from '../components/CardStack';
import { AddTripSheet } from '../components/AddTripSheet';
import { TripActionsSheet } from '../components/TripActionsSheet';
import { EmptyState, IconButton, PrimaryButton, Sheet, SheetRow, TopBar } from '../components/ui';
import { plural } from '../lib/utils';
import { isVisited, upcomingLabel, upcomingStatus } from '../lib/tripStatus';

interface Props {
  region: RegionFilter;
  setRegion: (r: RegionFilter) => void;
  year: number | null;
  setYear: (y: number | null) => void;
  onOpenTrip: (id: string, justCreated?: boolean) => void;
}

export function TripsScreen({ region, setRegion, year, setYear, onOpenTrip }: Props) {
  const { trips, photos, photosOf, coverOf } = useStore();
  const [regionOpen, setRegionOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [actionTrip, setActionTrip] = useState<Trip | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const startYear = (t: Trip) => (t.startDate ? Number(t.startDate.slice(0, 4)) : null);
  const years = useMemo(
    () => [...new Set([...photos.map((p) => new Date(p.takenAt).getFullYear()), ...trips.map(startYear).filter((y): y is number => y != null)])].sort((a, b) => b - a),
    [photos, trips],
  );

  const list = useMemo(
    () =>
      trips
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .filter((t) => region === 'Everywhere' || regionOf(t.countryCode) === region)
        .filter((t) => year == null || startYear(t) === year || photosOf(t.id).some((p) => new Date(p.takenAt).getFullYear() === year)),
    [trips, region, year, photosOf],
  );
  // Trips you're planning (no moments yet) come first, soonest first; undated ones last.
  const upcoming = list
    .filter((t) => !isVisited(t, photosOf(t.id).length))
    .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));
  const visited = list.filter((t) => isVisited(t, photosOf(t.id).length));
  const sectionTitle = (text: string) => <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/40 pt-1">{text}</h2>;

  const regionCount = (r: RegionFilter) => (r === 'Everywhere' ? trips.length : trips.filter((t) => regionOf(t.countryCode) === r).length);

  return (
    <>
      <TopBar
        left={
          <button type="button" onClick={() => setRegionOpen(true)} className="flex items-center gap-1">
            <span className="text-lg font-semibold text-white">{region}</span>
            <ChevronDown size={18} className="text-white/70" />
          </button>
        }
        right={
          <>
            <IconButton label="Filter by year" onClick={() => setYearOpen(true)} className={year ? 'text-white' : undefined}>
              <Calendar size={22} />
            </IconButton>
            <IconButton label="Add trip" onClick={() => setAddOpen(true)}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />

      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto scrollbar-hide px-6 pt-28 pb-24">
        <CardStack
          scrollRef={scrollRef}
          items={[
            ...(year
              ? [
                  {
                    key: 'year',
                    node: (
                      <button type="button" onClick={() => setYear(null)} className="liquid-glass rounded-full px-3 py-1.5 text-xs text-white/90 inline-flex items-center gap-1.5">
                        Trips in {year} <X size={12} />
                      </button>
                    ),
                  },
                ]
              : []),
            ...(upcoming.length ? [{ key: 'upcoming-title', node: sectionTitle('Upcoming') }] : []),
            ...upcoming.map((t, i) => ({
              key: t.id,
              card: true,
              node: (
                <DestinationCard
                  trip={t}
                  index={i}
                  cover={photoSrc(coverOf(t))}
                  badge={upcomingLabel(upcomingStatus(t))}
                  upcoming
                  onOpen={() => onOpenTrip(t.id)}
                  onMore={() => setActionTrip(t)}
                />
              ),
            })),
            ...(upcoming.length && visited.length ? [{ key: 'stamps-title', node: sectionTitle('Your stamps') }] : []),
            ...visited.map((t, i) => ({
              key: t.id,
              card: true,
              node: (
                <DestinationCard
                  trip={t}
                  index={upcoming.length + i}
                  cover={photoSrc(coverOf(t))}
                  badge={plural(photosOf(t.id).length, 'moment')}
                  onOpen={() => onOpenTrip(t.id)}
                  onMore={() => setActionTrip(t)}
                />
              ),
            })),
          ]}
        />
        {!list.length && (
          <EmptyState
            icon={<Globe size={26} />}
            title={trips.length ? 'Nothing here yet' : 'Your passport is empty'}
            body={trips.length ? `No trips match ${region}${year ? ` in ${year}` : ''}.` : 'Add the first country you travelled to and start collecting moments.'}
            action={<PrimaryButton onClick={() => setAddOpen(true)}>Add a trip</PrimaryButton>}
          />
        )}
      </div>

      <Sheet open={regionOpen} onClose={() => setRegionOpen(false)} title="Show trips in">
        <div className="space-y-1">
          {(['Everywhere', ...REGIONS] as RegionFilter[]).map((r) => (
            <SheetRow
              key={r}
              label={r}
              active={region === r}
              hint={region === r ? <Check size={16} className="text-white" /> : plural(regionCount(r), 'trip')}
              onClick={() => {
                setRegion(r);
                setRegionOpen(false);
              }}
            />
          ))}
        </div>
      </Sheet>

      <Sheet open={yearOpen} onClose={() => setYearOpen(false)} title="Travel year">
        <div className="space-y-1">
          <SheetRow label="All years" active={year == null} hint={year == null ? <Check size={16} className="text-white" /> : undefined} onClick={() => { setYear(null); setYearOpen(false); }} />
          {years.map((y) => (
            <SheetRow
              key={y}
              label={String(y)}
              active={year === y}
              hint={year === y ? <Check size={16} className="text-white" /> : plural(trips.filter((t) => startYear(t) === y || photosOf(t.id).some((p) => new Date(p.takenAt).getFullYear() === y)).length, 'trip')}
              onClick={() => {
                setYear(y);
                setYearOpen(false);
              }}
            />
          ))}
        </div>
      </Sheet>

      <AddTripSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(t) => {
          setAddOpen(false);
          onOpenTrip(t.id, true);
        }}
      />
      <TripActionsSheet
        trip={actionTrip}
        onClose={() => setActionTrip(null)}
        onOpen={(id) => {
          setActionTrip(null);
          onOpenTrip(id);
        }}
      />
    </>
  );
}
