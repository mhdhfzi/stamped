export type Region = 'Asia' | 'Europe' | 'Africa' | 'North America' | 'South America' | 'Oceania';
export type RegionFilter = Region | 'Everywhere';
export type Tab = 'feed' | 'account' | 'trips';

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  region: Region;
  flag: string;
}

/** One destination card — a country you visited (title can be a city, e.g. "Tokyo"). */
export interface Trip {
  id: string;
  countryCode: string;
  title: string;
  coverPhotoId?: string;
  createdAt: number;
  /** A trip you're planning. It counts as visited once it has a moment. */
  planned?: boolean;
  /** Trip dates as yyyy-mm-dd (local). Used by the day planner. */
  startDate?: string;
  endDate?: string;
  /** How the planner draws routes between stops. */
  travelMode?: TravelMode;
  /** Legacy single hotel for the whole trip (used when `stays` is not set). */
  base?: Place;
  /** Where you sleep, by range of nights (day indexes). Lets multi-city trips change hotel. */
  stays?: HotelStay[];
  /** Total budget for the trip. */
  budget?: { amount: number; currency: string };
  /** Set when the trip is shared with friends (Firestore group id): its plan syncs and it has a group chat. */
  groupId?: string;
  /** Packing checklist (small, so it lives on the trip and travels with backups). */
  packing?: PackItem[];
}

export type PackCategory = 'documents' | 'clothes' | 'toiletries' | 'electronics' | 'health' | 'other';

export interface PackItem {
  id: string;
  name: string;
  category: PackCategory;
  packed: boolean;
}

export type ExpenseCategory = 'stay' | 'food' | 'transport' | 'activities' | 'shopping' | 'other';

/** Money spent on a trip, in the currency it was paid in. */
export interface Expense {
  id: string;
  tripId: string;
  amount: number;
  /** ISO 4217, e.g. "JPY". */
  currency: string;
  category: ExpenseCategory;
  note?: string;
  /** yyyy-mm-dd (local). */
  date: string;
  createdAt: number;
}

/** A hotel (or area) for nights `from`..`to` (0-based day indexes, inclusive). */
export interface HotelStay {
  id: string;
  place: Place;
  from: number;
  to: number;
}

export interface Place {
  name: string;
  /** "area" = staying somewhere around a neighbourhood/city, not a specific hotel yet. */
  kind?: 'stay' | 'area';
  address?: string;
  lat: number;
  lng: number;
}

/** How you get around: walking, driving, or public transport (subway, train, bus). */
export type TravelMode = 'foot' | 'car' | 'transit';

/** One planned place on a day of a trip. */
export interface Stop {
  id: string;
  tripId: string;
  /** 0-based day index from the trip's start date. */
  day: number;
  /** Position within the day. */
  order: number;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  /** Planned time, "HH:MM". */
  time?: string;
  note?: string;
  done?: boolean;
  createdAt: number;
}

/** One "moment" — a photo attached to a trip. */
export interface Photo {
  id: string;
  tripId: string;
  /** Locally stored, compressed image. */
  blob?: Blob;
  /** Remote image (used by demo data). */
  url?: string;
  caption?: string;
  place?: string;
  favorite?: boolean;
  /** Capture time: from the photo's EXIF when available, else the file date. */
  takenAt: number;
  /** Where the photo was taken (from EXIF GPS), used to link it to planned places. */
  lat?: number;
  lng?: number;
  createdAt: number;
  /** Shared trips: this photo is in the group (uploaded by you, or received from a friend). */
  synced?: boolean;
  /** Shared trips: uid of whoever added it. */
  addedBy?: string;
}
