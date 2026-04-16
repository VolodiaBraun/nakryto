// ─── Ресторан ────────────────────────────────────────────────────────────────

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  address?: string;
  phone?: string;
  description?: string;
  logoUrl?: string;
  timezone: string;
  workingHours: WorkingHours;
  settings: RestaurantSettings;
  isActive: boolean;
  telegramBotActive?: boolean;
  maxBotActive?: boolean;
  bookingLimitExceeded?: boolean;
  plan?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkingHours {
  mon: DaySchedule;
  tue: DaySchedule;
  wed: DaySchedule;
  thu: DaySchedule;
  fri: DaySchedule;
  sat: DaySchedule;
  sun: DaySchedule;
}

export interface DaySchedule {
  open: string;
  close: string;
  closed: boolean;
}

export interface RestaurantSettings {
  minBookingHours: number;
  maxBookingDays: number;
  slotMinutes: number;
  bufferMinutes: number;
  autoConfirm: boolean;
  widgetButtonText?: string;
  widgetButtonColor?: string;
  widgetButtonTextColor?: string;
}

// ─── Пользователь ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  restaurantId: string | null;
  email: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'HOSTESS';
  userType: 'RESTAURANT_OWNER' | 'PARTNER';
  emailVerified: boolean;
  telegramChatId?: string;
}

export interface AuthResponse {
  user: User;
  restaurant: Restaurant;
  accessToken: string;
  refreshToken: string;
}

// ─── Зал ─────────────────────────────────────────────────────────────────────

export interface Hall {
  id: string;
  restaurantId: string;
  name: string;
  floorPlan: FloorPlan;
  photos?: string[];
  sortOrder: number;
  isActive: boolean;
  tables: Table[];
}

export type FloorPattern = 'none' | 'parquet' | 'tile' | 'stone' | 'concrete' | 'carpet';

export interface FloorTheme {
  preset?: string;
  bgColor?: string;
  bgPattern?: FloorPattern;
  bgPatternUrl?: string;      // кастомная текстура пола (URL из S3)
  patternScaleX?: number;     // масштаб по X (ширина плитки)
  patternScaleY?: number;     // масштаб по Y (высота плитки)
  patternRotation?: number;
  tableStyle?: {
    fill: string;
    stroke: string;
    text: string;
  };
}

export interface FloorPlan {
  width: number;
  height: number;
  objects: FloorPlanObject[];
  theme?: FloorTheme;
}

export type FloorPlanObject = TableObject | DecorativeObject;

export interface TableObject {
  type: 'table';
  id: string;
  label: string;
  shape: TableShape;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  minGuests: number;
  maxGuests: number;
  comment?: string;
  tags?: string[];
  customFill?: string;
  customStroke?: string;
  customTextColor?: string;
  iconUrl?: string;
}

export interface DecorativeObject {
  type: 'wall' | 'column' | 'bar' | 'window';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string;
  customFill?: string;
  customStroke?: string;
}

export type TableShape = 'ROUND' | 'SQUARE' | 'RECTANGLE';

// ─── Стол ─────────────────────────────────────────────────────────────────────

export interface Table {
  id: string;
  hallId: string;
  label: string;
  shape: TableShape;
  minGuests: number;
  maxGuests: number;
  positionX: number;
  positionY: number;
  rotation: number;
  width: number;
  height: number;
  comment?: string;
  tags?: string[];
  photos?: string[];
  isActive: boolean;
}

export type TableStatus = 'FREE' | 'BOOKED' | 'LOCKED';

export interface TableWithStatus extends Table {
  status: TableStatus;
}

// ─── Бронь ───────────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type BookingSource = 'ONLINE' | 'PHONE' | 'MANUAL';

export interface Booking {
  id: string;
  restaurantId: string;
  tableId: string;
  hallId: string;
  table: Table;
  hall: Hall;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  telegramUserId?: string;
  maxUserId?: string;
  guestCount: number;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  source: BookingSource;
  notes?: string;
  token: string;
  consentGiven: boolean;
  createdAt: string;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  availableTablesCount: number;
}
