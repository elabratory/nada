/**
 * Single source of truth for the demo centre.
 *
 * Everything in the 3D world, the map, search, directory and navigation is
 * generated from this file. In the long-term product, a shopping centre would
 * upload this same shape of data (floor plan rectangles, tenants, products,
 * promotions, hours) and the viewer would build their virtual centre from it.
 *
 * All brands, products, prices and promotions are FICTIONAL demo content.
 *
 * Coordinates are in metres on the floor plane: x runs west (-) to east (+),
 * z runs north (-) to south (+). One floor only for the MVP.
 */

export type Category = 'Fashion' | 'Technology' | 'Food' | 'Beauty' | 'Sport' | 'Entertainment';
export const CATEGORIES: Category[] = ['Fashion', 'Technology', 'Food', 'Beauty', 'Sport', 'Entertainment'];

/** Axis-aligned rectangle on the floor plane (min/max corners). */
export interface Rect {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

/** Opening hours indexed by day, Sunday = 0. `null` = closed. */
export type WeekHours = ([open: string, close: string] | null)[];

export type ProductShape =
  | 'shoe'
  | 'tee'
  | 'hoodie'
  | 'shorts'
  | 'bottle'
  | 'phone'
  | 'laptop'
  | 'tablet'
  | 'watch'
  | 'headphones'
  | 'tv'
  | 'speaker'
  | 'console'
  | 'vinyl'
  | 'jacket'
  | 'bag'
  | 'cap'
  | 'socks'
  | 'lipstick'
  | 'perfume'
  | 'jar';

export interface Product {
  id: string;
  storeId: string;
  name: string;
  /** Plain-language type used in search results, e.g. "Running Shoes". */
  type: string;
  price: number;
  /** Optional original price when on promotion. */
  wasPrice?: number;
  optionLabel?: string;
  options?: string[];
  description: string;
  details: string[];
  availability: 'In stock' | 'Low stock' | 'Online only';
  stockNote: string;
  tags: string[];
  shape: ProductShape;
  color: string;
  accent?: string;
  /** Placeholder purchase link. Would point at the retailer in production. */
  buyUrl: string;
}

export interface Promotion {
  id: string;
  placeId: string;
  title: string;
  detail: string;
  ends: string;
}

export interface Store {
  id: string;
  name: string;
  /** Which kind of real retailer this demo tenant stands in for. */
  inspiredBy: string;
  categories: Category[];
  tagline: string;
  description: string;
  unit: string;
  side: 'north' | 'south';
  rect: Rect;
  doorX: number;
  color: string;
  accent: string;
  hours: WeekHours;
  phone: string;
  products: Product[];
}

export interface MenuItem {
  name: string;
  price: number;
  popular?: boolean;
  note?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  unit: string;
  /** Centre of the counter frontage inside the food court. */
  x: number;
  z: number;
  color: string;
  accent: string;
  hours: WeekHours;
  menu: { section: string; items: MenuItem[] }[];
  tags: string[];
}

export type FacilityKind = 'restroom' | 'lift' | 'escalator' | 'entrance' | 'parking' | 'info' | 'baby';

export interface Facility {
  id: string;
  name: string;
  kind: FacilityKind;
  description: string;
  x: number;
  z: number;
  /** Where navigation should deliver you (defaults to x/z). */
  approach?: { x: number; z: number };
  tags: string[];
}

const RETAIL: WeekHours = [
  ['10:00', '16:00'],
  ['09:00', '17:30'],
  ['09:00', '17:30'],
  ['09:00', '17:30'],
  ['09:00', '21:00'],
  ['09:00', '17:30'],
  ['09:00', '17:00'],
];
const FOOD: WeekHours = [
  ['08:00', '17:00'],
  ['07:30', '20:00'],
  ['07:30', '20:00'],
  ['07:30', '20:00'],
  ['07:30', '21:30'],
  ['07:30', '21:30'],
  ['08:00', '21:30'],
];
const EARLY: WeekHours = [
  ['07:00', '16:00'],
  ['06:30', '17:30'],
  ['06:30', '17:30'],
  ['06:30', '17:30'],
  ['06:30', '21:00'],
  ['06:30', '17:30'],
  ['07:00', '17:00'],
];

export const CENTRE = {
  name: 'Harbour Central',
  subtitle: 'Demo shopping centre',
  address: '1 Demo Quay, Harbour City (fictional)',
  hours: RETAIL,
  bounds: { x1: -50, z1: -24, x2: 50, z2: 27 } as Rect,
  concourse: { x1: -48, z1: -7, x2: 48, z2: 7 } as Rect,
  foodCourt: { x1: 8, z1: 7, x2: 44, z2: 24 } as Rect,
  southHall: { x1: -4, z1: 7, x2: 4, z2: 20 } as Rect,
  amenities: { x1: -8, z1: -12, x2: 8, z2: -7 } as Rect,
  atrium: { x1: -5.5, z1: -2.6, x2: 5.5, z2: 2.6 } as Rect,
  /** Where visitors start, and where "Return to centre" takes them. */
  start: { x: -44, z: 0, yaw: -Math.PI / 2 },
  centre: { x: -9, z: 0, yaw: -Math.PI / 2 },
  parking: [
    { level: 'P1', spaces: 420, note: 'Direct access via the East Entrance. First 2 hours free (demo).' },
    { level: 'P2', spaces: 380, note: 'Accessible bays and parents-with-prams parking beside the lifts.' },
    { level: 'P3', spaces: 350, note: 'EV chargers (demo): 12 bays.' },
  ],
};

const img = (storeId: string, slug: string) => `https://example.com/demo-retailer/${storeId}/${slug}`;

const SIZES_SHOE = ['7', '8', '9', '10', '11'];
const SIZES_APPAREL = ['XS', 'S', 'M', 'L', 'XL'];

export const STORES: Store[] = [
  {
    id: 'stride',
    name: 'Stride Athletics',
    inspiredBy: 'a global sportswear brand (e.g. Nike)',
    categories: ['Sport', 'Fashion'],
    tagline: 'Run further. Train smarter.',
    description:
      'Performance footwear, running apparel and training gear. Try-on area with a treadmill for gait checks (demo).',
    unit: 'N01',
    side: 'north',
    rect: { x1: -44, z1: -21, x2: -28, z2: -7 },
    doorX: -36,
    color: '#ff5a36',
    accent: '#111111',
    hours: RETAIL,
    phone: '(00) 0000 0101',
    products: [
      {
        id: 'stride-pace-runner',
        storeId: 'stride',
        name: 'Stride Pace Runner',
        type: 'Running Shoes',
        price: 149,
        wasPrice: 179,
        optionLabel: 'Available sizes',
        options: SIZES_SHOE,
        description: 'A lightweight daily trainer with a springy foam midsole for easy and tempo runs.',
        details: ['Weight: 255 g (size 9)', 'Heel-to-toe drop: 8 mm', 'Engineered mesh upper', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store — all sizes',
        tags: ['running shoes', 'running', 'shoes', 'sneakers', 'trainers', 'runners', 'footwear'],
        shape: 'shoe',
        color: '#ff5a36',
        accent: '#ffffff',
        buyUrl: img('stride', 'pace-runner'),
      },
      {
        id: 'stride-trail',
        storeId: 'stride',
        name: 'Stride Trail Grip',
        type: 'Trail Running Shoes',
        price: 189,
        optionLabel: 'Available sizes',
        options: ['8', '9', '10', '11'],
        description: 'Rugged trail shoe with deep lugs and a rock plate for technical terrain.',
        details: ['Water-resistant upper', '5 mm lugs', 'Rock plate', 'Demo product'],
        availability: 'Low stock',
        stockNote: 'Low stock — 3 pairs left in store',
        tags: ['running shoes', 'trail', 'running', 'shoes', 'hiking', 'footwear'],
        shape: 'shoe',
        color: '#3b7a57',
        accent: '#f2c14e',
        buyUrl: img('stride', 'trail-grip'),
      },
      {
        id: 'stride-tee',
        storeId: 'stride',
        name: 'Aero Running Tee',
        type: 'Running Shirt',
        price: 45,
        optionLabel: 'Available sizes',
        options: SIZES_APPAREL,
        description: 'Breathable, quick-dry running tee with reflective details.',
        details: ['Recycled polyester', 'Reflective logo', 'Flatlock seams', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['shirt', 'tee', 't-shirt', 'running', 'top', 'activewear', 'clothing'],
        shape: 'tee',
        color: '#2d6cdf',
        buyUrl: img('stride', 'aero-tee'),
      },
      {
        id: 'stride-shorts',
        storeId: 'stride',
        name: 'Tempo 5" Shorts',
        type: 'Running Shorts',
        price: 39,
        optionLabel: 'Available sizes',
        options: SIZES_APPAREL,
        description: 'Light running shorts with a built-in liner and zip pocket.',
        details: ['Zip back pocket', 'Built-in brief', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['shorts', 'running', 'activewear', 'clothing', 'gym'],
        shape: 'shorts',
        color: '#222831',
        buyUrl: img('stride', 'tempo-shorts'),
      },
      {
        id: 'stride-bottle',
        storeId: 'stride',
        name: 'Hydro Flow Bottle 750 ml',
        type: 'Water Bottle',
        price: 25,
        description: 'Insulated steel bottle that keeps drinks cold for 24 hours.',
        details: ['750 ml', 'Double-wall steel', 'Dishwasher safe', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['bottle', 'water bottle', 'drink', 'gym', 'accessories'],
        shape: 'bottle',
        color: '#ff5a36',
        buyUrl: img('stride', 'hydro-bottle'),
      },
    ],
  },
  {
    id: 'orchard',
    name: 'Orchard Tech',
    inspiredBy: 'a premium consumer-electronics brand (e.g. Apple)',
    categories: ['Technology'],
    tagline: 'Thoughtfully designed technology.',
    description: 'Phones, laptops, tablets, wearables and audio, with a Genius-style help bar for setup and repairs (demo).',
    unit: 'N02',
    side: 'north',
    rect: { x1: -24, z1: -21, x2: -8, z2: -7 },
    doorX: -16,
    color: '#e9ecef',
    accent: '#1d1d1f',
    hours: RETAIL,
    phone: '(00) 0000 0102',
    products: [
      {
        id: 'orchard-phone',
        storeId: 'orchard',
        name: 'Orchard Phone 15',
        type: 'Smartphone',
        price: 1299,
        optionLabel: 'Storage',
        options: ['128 GB', '256 GB', '512 GB'],
        description: 'A 6.1-inch smartphone with an all-day battery and a dual-lens camera.',
        details: ['6.1" OLED display', '48 MP main camera', 'USB-C', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock — pick up today',
        tags: ['phone', 'smartphone', 'mobile', 'iphone', 'cell'],
        shape: 'phone',
        color: '#2b2d42',
        buyUrl: img('orchard', 'phone-15'),
      },
      {
        id: 'orchard-book',
        storeId: 'orchard',
        name: 'Orchard Book Air 13"',
        type: 'Laptop',
        price: 1899,
        optionLabel: 'Configuration',
        options: ['8-core / 16 GB', '10-core / 24 GB'],
        description: 'An ultra-thin, fanless laptop with an 18-hour battery.',
        details: ['13.6" display', '1.24 kg', 'Two USB-C ports', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['laptop', 'computer', 'notebook', 'macbook'],
        shape: 'laptop',
        color: '#c0c6cf',
        buyUrl: img('orchard', 'book-air'),
      },
      {
        id: 'orchard-pad',
        storeId: 'orchard',
        name: 'Orchard Pad 11"',
        type: 'Tablet',
        price: 749,
        optionLabel: 'Storage',
        options: ['128 GB', '256 GB'],
        description: 'An 11-inch tablet for drawing, notes and streaming.',
        details: ['11" display', 'Stylus support', 'Demo product'],
        availability: 'Low stock',
        stockNote: 'Low stock — 2 left in store',
        tags: ['tablet', 'ipad', 'drawing'],
        shape: 'tablet',
        color: '#8d99ae',
        buyUrl: img('orchard', 'pad-11'),
      },
      {
        id: 'orchard-watch',
        storeId: 'orchard',
        name: 'Orchard Watch S3',
        type: 'Smartwatch',
        price: 599,
        optionLabel: 'Case size',
        options: ['41 mm', '45 mm'],
        description: 'Fitness and health tracking with GPS and an always-on display.',
        details: ['GPS', 'Heart-rate sensor', 'Water resistant 50 m', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['watch', 'smartwatch', 'wearable', 'fitness', 'running'],
        shape: 'watch',
        color: '#ef476f',
        buyUrl: img('orchard', 'watch-s3'),
      },
      {
        id: 'orchard-pods',
        storeId: 'orchard',
        name: 'Orchard Sound Max',
        type: 'Headphones',
        price: 399,
        description: 'Over-ear headphones with adaptive noise cancelling.',
        details: ['30-hour battery', 'Noise cancelling', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['headphones', 'audio', 'noise cancelling', 'music', 'airpods'],
        shape: 'headphones',
        color: '#e9ecef',
        buyUrl: img('orchard', 'sound-max'),
      },
    ],
  },
  {
    id: 'thread',
    name: 'Thread & Co',
    inspiredBy: 'a fast-fashion retailer (e.g. H&M)',
    categories: ['Fashion'],
    tagline: 'Everyday style, fairly priced.',
    description: 'Affordable wardrobe staples for women, men and kids, with a conscious-cotton range (demo).',
    unit: 'N03',
    side: 'north',
    rect: { x1: 8, z1: -21, x2: 24, z2: -7 },
    doorX: 16,
    color: '#d62839',
    accent: '#ffffff',
    hours: RETAIL,
    phone: '(00) 0000 0103',
    products: [
      {
        id: 'thread-tee',
        storeId: 'thread',
        name: 'Organic Cotton Tee',
        type: 'T-Shirt',
        price: 19.99,
        optionLabel: 'Available sizes',
        options: SIZES_APPAREL,
        description: 'A soft, regular-fit tee in organic cotton. Part of our 3-for-2 shirts deal.',
        details: ['100% organic cotton', 'Regular fit', 'Machine washable', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['shirt', 'shirts', 'tee', 't-shirt', 'top', 'clothing', 'basics'],
        shape: 'tee',
        color: '#f4f1de',
        buyUrl: img('thread', 'organic-tee'),
      },
      {
        id: 'thread-linen',
        storeId: 'thread',
        name: 'Linen Blend Shirt',
        type: 'Shirt',
        price: 39.99,
        optionLabel: 'Available sizes',
        options: SIZES_APPAREL,
        description: 'Relaxed linen-blend shirt, ideal for warm days.',
        details: ['55% linen, 45% cotton', 'Relaxed fit', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['shirt', 'shirts', 'linen', 'clothing', 'summer'],
        shape: 'tee',
        color: '#a8dadc',
        buyUrl: img('thread', 'linen-shirt'),
      },
      {
        id: 'thread-denim',
        storeId: 'thread',
        name: 'Relaxed Denim Jacket',
        type: 'Jacket',
        price: 79.99,
        optionLabel: 'Available sizes',
        options: SIZES_APPAREL,
        description: 'A classic denim jacket with a relaxed, boxy fit.',
        details: ['100% cotton denim', 'Button front', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['jacket', 'denim', 'coat', 'clothing', 'outerwear'],
        shape: 'jacket',
        color: '#457b9d',
        buyUrl: img('thread', 'denim-jacket'),
      },
      {
        id: 'thread-hoodie',
        storeId: 'thread',
        name: 'Soft Knit Hoodie',
        type: 'Hoodie',
        price: 49.99,
        optionLabel: 'Available sizes',
        options: SIZES_APPAREL,
        description: 'Brushed-back knit hoodie with a kangaroo pocket.',
        details: ['Cotton blend', 'Kangaroo pocket', 'Demo product'],
        availability: 'Online only',
        stockNote: 'Sold out in store — available online',
        tags: ['hoodie', 'jumper', 'sweater', 'clothing'],
        shape: 'hoodie',
        color: '#6d597a',
        buyUrl: img('thread', 'knit-hoodie'),
      },
      {
        id: 'thread-tote',
        storeId: 'thread',
        name: 'Canvas Tote Bag',
        type: 'Bag',
        price: 14.99,
        description: 'Sturdy canvas tote with an inside pocket.',
        details: ['Heavy cotton canvas', 'Inside pocket', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['bag', 'tote', 'accessories'],
        shape: 'bag',
        color: '#e9c46a',
        buyUrl: img('thread', 'canvas-tote'),
      },
    ],
  },
  {
    id: 'lumiere',
    name: 'Lumière Beauty',
    inspiredBy: 'a prestige beauty retailer (e.g. Sephora)',
    categories: ['Beauty'],
    tagline: 'Discover your glow.',
    description: 'Makeup, skincare and fragrance with free in-store skin consultations (demo).',
    unit: 'N04',
    side: 'north',
    rect: { x1: 28, z1: -21, x2: 44, z2: -7 },
    doorX: 36,
    color: '#1a1a1a',
    accent: '#f7c8d8',
    hours: RETAIL,
    phone: '(00) 0000 0104',
    products: [
      {
        id: 'lumiere-lipstick',
        storeId: 'lumiere',
        name: 'Velvet Matte Lipstick',
        type: 'Lipstick',
        price: 32,
        optionLabel: 'Shades',
        options: ['Rosewood', 'Ruby', 'Nude Silk', 'Berry'],
        description: 'A long-wear matte lipstick that stays comfortable all day.',
        details: ['Vegan formula', '3.5 g', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['lipstick', 'makeup', 'lips', 'cosmetics'],
        shape: 'lipstick',
        color: '#b5179e',
        buyUrl: img('lumiere', 'velvet-lipstick'),
      },
      {
        id: 'lumiere-parfum',
        storeId: 'lumiere',
        name: 'Aurora Eau de Parfum',
        type: 'Perfume',
        price: 129,
        optionLabel: 'Size',
        options: ['30 ml', '50 ml', '100 ml'],
        description: 'A luminous floral fragrance with notes of neroli, jasmine and amber.',
        details: ['Eau de parfum', 'Top: neroli · Heart: jasmine · Base: amber', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['perfume', 'fragrance', 'scent', 'gift'],
        shape: 'perfume',
        color: '#ffd6a5',
        buyUrl: img('lumiere', 'aurora-edp'),
      },
      {
        id: 'lumiere-serum',
        storeId: 'lumiere',
        name: 'Glow Vitamin C Serum',
        type: 'Skincare',
        price: 58,
        description: 'Brightening serum with 15% vitamin C.',
        details: ['30 ml', 'Fragrance-free', 'Demo product'],
        availability: 'Low stock',
        stockNote: 'Low stock — 4 left in store',
        tags: ['serum', 'skincare', 'skin', 'vitamin c', 'face'],
        shape: 'bottle',
        color: '#f4a261',
        buyUrl: img('lumiere', 'glow-serum'),
      },
      {
        id: 'lumiere-cream',
        storeId: 'lumiere',
        name: 'Hydra Cloud Cream',
        type: 'Moisturiser',
        price: 46,
        description: 'Whipped gel-cream moisturiser for all-day hydration.',
        details: ['50 ml', 'Hyaluronic acid', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['moisturiser', 'moisturizer', 'cream', 'skincare', 'face'],
        shape: 'jar',
        color: '#caf0f8',
        buyUrl: img('lumiere', 'hydra-cream'),
      },
    ],
  },
  {
    id: 'vault',
    name: 'Sneaker Vault',
    inspiredBy: 'a multi-brand sneaker retailer (e.g. Foot Locker)',
    categories: ['Sport', 'Fashion'],
    tagline: 'Every drop. Every size.',
    description: 'Multi-brand sneakers, running shoes and streetwear with a members’ release calendar (demo).',
    unit: 'S01',
    side: 'south',
    rect: { x1: -44, z1: 7, x2: -28, z2: 21 },
    doorX: -36,
    color: '#1b1b1b',
    accent: '#ffffff',
    hours: RETAIL,
    phone: '(00) 0000 0105',
    products: [
      {
        id: 'vault-velocity',
        storeId: 'vault',
        name: 'Velocity Runner 2',
        type: 'Running Shoes',
        price: 169,
        wasPrice: 199,
        optionLabel: 'Available sizes',
        options: ['7', '8', '9', '10', '11', '12'],
        description: 'Cushioned neutral running shoe with a rocker sole for smooth transitions.',
        details: ['Neutral support', '10 mm drop', 'Knit upper', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store — sizes 7–12',
        tags: ['running shoes', 'running', 'shoes', 'sneakers', 'trainers', 'runners', 'footwear'],
        shape: 'shoe',
        color: '#f1faee',
        accent: '#e63946',
        buyUrl: img('vault', 'velocity-runner-2'),
      },
      {
        id: 'vault-court',
        storeId: 'vault',
        name: 'Court Classic Low',
        type: 'Sneakers',
        price: 129,
        optionLabel: 'Available sizes',
        options: SIZES_SHOE,
        description: 'A clean leather court sneaker that goes with everything.',
        details: ['Leather upper', 'Rubber cupsole', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['sneakers', 'shoes', 'trainers', 'casual', 'footwear'],
        shape: 'shoe',
        color: '#ffffff',
        accent: '#1d3557',
        buyUrl: img('vault', 'court-classic'),
      },
      {
        id: 'vault-cap',
        storeId: 'vault',
        name: 'Street Six-Panel Cap',
        type: 'Cap',
        price: 35,
        description: 'Structured cap with an adjustable strap.',
        details: ['Cotton twill', 'One size', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['cap', 'hat', 'accessories', 'streetwear'],
        shape: 'cap',
        color: '#e63946',
        buyUrl: img('vault', 'six-panel-cap'),
      },
      {
        id: 'vault-socks',
        storeId: 'vault',
        name: 'Performance Crew Socks (3-pack)',
        type: 'Socks',
        price: 19,
        optionLabel: 'Sizes',
        options: ['S', 'M', 'L'],
        description: 'Cushioned crew socks with arch support.',
        details: ['3 pairs', 'Moisture-wicking', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['socks', 'running', 'accessories'],
        shape: 'socks',
        color: '#ffffff',
        buyUrl: img('vault', 'crew-socks'),
      },
    ],
  },
  {
    id: 'volt',
    name: 'Volt Hi-Fi',
    inspiredBy: 'an entertainment & electronics retailer (e.g. JB Hi-Fi)',
    categories: ['Entertainment', 'Technology'],
    tagline: 'Turn it up.',
    description: 'TVs, audio, gaming, music and movies at sharp prices (demo).',
    unit: 'S02',
    side: 'south',
    rect: { x1: -24, z1: 7, x2: -8, z2: 21 },
    doorX: -16,
    color: '#ffd400',
    accent: '#111111',
    hours: RETAIL,
    phone: '(00) 0000 0106',
    products: [
      {
        id: 'volt-tv',
        storeId: 'volt',
        name: 'Nova 65" 4K TV',
        type: 'Television',
        price: 1499,
        wasPrice: 1699,
        optionLabel: 'Screen size',
        options: ['55"', '65"', '75"'],
        description: 'A 65-inch 4K HDR smart TV with a 120 Hz panel for gaming.',
        details: ['4K HDR', '120 Hz', '4 × HDMI 2.1', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock — free delivery (demo)',
        tags: ['tv', 'television', '4k', 'screen', 'home theatre'],
        shape: 'tv',
        color: '#111111',
        buyUrl: img('volt', 'nova-65'),
      },
      {
        id: 'volt-speaker',
        storeId: 'volt',
        name: 'BassBox Go',
        type: 'Bluetooth Speaker',
        price: 199,
        description: 'Waterproof portable speaker with 20 hours of play time.',
        details: ['IP67 waterproof', '20-hour battery', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['speaker', 'bluetooth', 'audio', 'music', 'portable'],
        shape: 'speaker',
        color: '#06d6a0',
        buyUrl: img('volt', 'bassbox-go'),
      },
      {
        id: 'volt-headphones',
        storeId: 'volt',
        name: 'Pulse Wireless ANC',
        type: 'Headphones',
        price: 349,
        description: 'Wireless noise-cancelling headphones with 40-hour battery.',
        details: ['40-hour battery', 'Multipoint Bluetooth', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['headphones', 'audio', 'noise cancelling', 'music', 'wireless'],
        shape: 'headphones',
        color: '#222222',
        buyUrl: img('volt', 'pulse-anc'),
      },
      {
        id: 'volt-console',
        storeId: 'volt',
        name: 'GameSphere X',
        type: 'Games Console',
        price: 699,
        optionLabel: 'Edition',
        options: ['Standard', 'Digital'],
        description: 'Next-gen games console with 1 TB storage.',
        details: ['4K 120 fps', '1 TB SSD', 'Demo product'],
        availability: 'Low stock',
        stockNote: 'Low stock — call ahead',
        tags: ['console', 'gaming', 'games', 'playstation', 'xbox'],
        shape: 'console',
        color: '#f8f9fa',
        buyUrl: img('volt', 'gamesphere-x'),
      },
      {
        id: 'volt-vinyl',
        storeId: 'volt',
        name: 'Neon Nights — Vinyl LP',
        type: 'Vinyl Record',
        price: 44,
        description: 'Fictional synth-pop album on 180 g vinyl.',
        details: ['180 g vinyl', 'Gatefold sleeve', 'Demo product'],
        availability: 'In stock',
        stockNote: 'In stock in store',
        tags: ['vinyl', 'record', 'music', 'album', 'lp'],
        shape: 'vinyl',
        color: '#7209b7',
        buyUrl: img('volt', 'neon-nights-lp'),
      },
    ],
  },
];

export const RESTAURANTS: Restaurant[] = [
  {
    id: 'burger-house',
    name: 'Burger House',
    cuisine: 'Burgers & fries',
    description: 'Quick-service burgers, fries and shakes. Stands in for a fast-food chain (e.g. McDonald’s) in this demo.',
    unit: 'F01',
    x: 12.5,
    z: 22.5,
    color: '#e63946',
    accent: '#ffd166',
    hours: EARLY,
    tags: ['burger', 'burgers', 'fries', 'fast food', 'shake', 'breakfast', 'mcdonalds'],
    menu: [
      {
        section: 'Burgers',
        items: [
          { name: 'Classic Cheeseburger', price: 8.9, popular: true },
          { name: 'Double Stack', price: 12.5, popular: true },
          { name: 'Crispy Chicken Burger', price: 10.5 },
          { name: 'Garden Veggie Burger', price: 9.9, note: 'Vegetarian' },
        ],
      },
      {
        section: 'Sides & drinks',
        items: [
          { name: 'Fries (regular)', price: 4.5, popular: true },
          { name: 'Thick Shake', price: 5.9 },
          { name: 'Meal deal: burger + fries + drink', price: 12.0 },
        ],
      },
    ],
  },
  {
    id: 'sushi-express',
    name: 'Sushi Express',
    cuisine: 'Japanese',
    description: 'Fresh hand rolls, sushi packs and bowls made to order.',
    unit: 'F02',
    x: 21.5,
    z: 22.5,
    color: '#1d3557',
    accent: '#f1faee',
    hours: FOOD,
    tags: ['sushi', 'japanese', 'rolls', 'bowl', 'healthy', 'rice'],
    menu: [
      {
        section: 'Sushi',
        items: [
          { name: 'Salmon Avocado Roll (8 pc)', price: 11.5, popular: true },
          { name: 'Teriyaki Chicken Hand Roll', price: 4.2, popular: true },
          { name: 'Tuna Nigiri (4 pc)', price: 9.8 },
        ],
      },
      {
        section: 'Bowls',
        items: [
          { name: 'Poke Bowl', price: 15.9, popular: true },
          { name: 'Miso Soup', price: 3.5 },
        ],
      },
    ],
  },
  {
    id: 'pizza-corner',
    name: 'Pizza Corner',
    cuisine: 'Pizza & pasta',
    description: 'Stone-baked pizza by the slice or whole, plus fresh pasta.',
    unit: 'F03',
    x: 30.5,
    z: 22.5,
    color: '#2a9d8f',
    accent: '#ffffff',
    hours: FOOD,
    tags: ['pizza', 'pasta', 'italian', 'slice'],
    menu: [
      {
        section: 'Pizza',
        items: [
          { name: 'Margherita slice', price: 5.5, popular: true },
          { name: 'Pepperoni slice', price: 6.0, popular: true },
          { name: 'Whole pizza (any)', price: 22.0 },
        ],
      },
      {
        section: 'Pasta',
        items: [
          { name: 'Penne Arrabbiata', price: 14.5 },
          { name: 'Spaghetti Carbonara', price: 16.0 },
        ],
      },
    ],
  },
  {
    id: 'coffee-lab',
    name: 'Coffee Lab',
    cuisine: 'Café',
    description: 'Specialty coffee, pastries and all-day breakfast.',
    unit: 'F04',
    x: 39.5,
    z: 22.5,
    color: '#6f4518',
    accent: '#ffe8d6',
    hours: EARLY,
    tags: ['coffee', 'cafe', 'café', 'breakfast', 'latte', 'pastry', 'tea'],
    menu: [
      {
        section: 'Coffee',
        items: [
          { name: 'Flat White', price: 5.2, popular: true },
          { name: 'Cold Brew', price: 5.8 },
          { name: 'Chai Latte', price: 5.5 },
        ],
      },
      {
        section: 'Breakfast',
        items: [
          { name: 'Smashed Avo Toast', price: 16.5, popular: true },
          { name: 'Butter Croissant', price: 4.8 },
          { name: 'Big Breakfast', price: 21.0, note: 'Free coffee included (demo deal)' },
        ],
      },
    ],
  },
];

export const FACILITIES: Facility[] = [
  {
    id: 'restrooms',
    name: 'Restrooms',
    kind: 'restroom',
    description: 'Male, female and accessible restrooms, plus a parents’ room. Located in the amenities alcove off the central atrium.',
    x: -3.5,
    z: -11.4,
    approach: { x: -2, z: -9.5 },
    tags: ['bathroom', 'bathrooms', 'toilet', 'toilets', 'restroom', 'washroom', 'loo', 'accessible toilet'],
  },
  {
    id: 'parents-room',
    name: 'Parents’ Room',
    kind: 'baby',
    description: 'Baby change, feeding room and bottle warmer.',
    x: -6.5,
    z: -11.4,
    approach: { x: -5.5, z: -9.5 },
    tags: ['baby', 'baby change', 'parents', 'feeding', 'nappy'],
  },
  {
    id: 'lifts',
    name: 'Lifts to Parking',
    kind: 'lift',
    description: 'Lifts to parking levels P1–P3. Step-free access.',
    x: 4.5,
    z: -11.4,
    approach: { x: 4.5, z: -9.5 },
    tags: ['lift', 'lifts', 'elevator', 'elevators', 'step free', 'accessible', 'parking'],
  },
  {
    id: 'escalators',
    name: 'Escalators',
    kind: 'escalator',
    description: 'Escalators in the central atrium. Level 2 is not part of this one-floor demo.',
    x: 0,
    z: 0,
    approach: { x: -7, z: 3.8 },
    tags: ['escalator', 'escalators', 'upstairs', 'level 2'],
  },
  {
    id: 'west-entrance',
    name: 'Main Entrance (West)',
    kind: 'entrance',
    description: 'Main entrance from Harbour Street. Taxi rank and drop-off zone outside.',
    x: -48,
    z: 0,
    approach: { x: -45.5, z: 0 },
    tags: ['entrance', 'exit', 'main entrance', 'west', 'taxi', 'drop off'],
  },
  {
    id: 'south-entrance',
    name: 'South Entrance',
    kind: 'entrance',
    description: 'Bus interchange and bike parking.',
    x: 0,
    z: 20,
    approach: { x: 0, z: 17.5 },
    tags: ['entrance', 'exit', 'south', 'bus', 'bike', 'bicycle'],
  },
  {
    id: 'east-entrance',
    name: 'East Entrance & Parking',
    kind: 'parking',
    description: 'Car park levels P1–P3 via the East Entrance. First 2 hours free (demo).',
    x: 48,
    z: 0,
    approach: { x: 45.5, z: 0 },
    tags: ['parking', 'car park', 'carpark', 'car', 'entrance', 'exit', 'east', 'ev charging'],
  },
  {
    id: 'info-desk',
    name: 'Information Desk',
    kind: 'info',
    description: 'Customer service, gift cards, lost property, wheelchair and pram hire.',
    x: -9,
    z: -5.2,
    approach: { x: -9, z: -3.5 },
    tags: ['information', 'info', 'help', 'customer service', 'gift cards', 'wheelchair', 'lost property'],
  },
];

export const PROMOTIONS: Promotion[] = [
  {
    id: 'promo-running',
    placeId: 'stride',
    title: '20% off selected running shoes',
    detail: 'Including the Stride Pace Runner, now $149 (was $179).',
    ends: 'Ends Sunday',
  },
  {
    id: 'promo-shirts',
    placeId: 'thread',
    title: 'Buy 2 shirts, get 1 free',
    detail: 'Mix and match tees and shirts. Cheapest item free.',
    ends: 'While stocks last',
  },
  {
    id: 'promo-coffee',
    placeId: 'coffee-lab',
    title: 'Free coffee with breakfast',
    detail: 'Any breakfast plate includes a regular coffee, before 11 am.',
    ends: 'Weekdays',
  },
  {
    id: 'promo-vault',
    placeId: 'vault',
    title: '$30 off Velocity Runner 2',
    detail: 'Plus free crew socks for members.',
    ends: 'Ends in 5 days',
  },
  {
    id: 'promo-tv',
    placeId: 'volt',
    title: 'Save $200 on Nova 65" TVs',
    detail: 'Free delivery within 20 km.',
    ends: 'This weekend',
  },
  {
    id: 'promo-orchard',
    placeId: 'orchard',
    title: 'Free setup session',
    detail: 'Book a free 30-minute setup with any new device.',
    ends: 'Ongoing',
  },
  {
    id: 'promo-lumiere',
    placeId: 'lumiere',
    title: 'Free mini with $75+ spend',
    detail: 'Choose from three deluxe skincare minis.',
    ends: 'Ends this month',
  },
  {
    id: 'promo-burger',
    placeId: 'burger-house',
    title: '$12 meal deal',
    detail: 'Any burger, regular fries and a drink.',
    ends: 'Every day',
  },
];

// ---------- lookups & helpers ----------

export type PlaceRef =
  | { kind: 'store'; id: string }
  | { kind: 'restaurant'; id: string }
  | { kind: 'facility'; id: string };

export const storeById = (id: string) => STORES.find((s) => s.id === id);
export const restaurantById = (id: string) => RESTAURANTS.find((r) => r.id === id);
export const facilityById = (id: string) => FACILITIES.find((f) => f.id === id);
export const ALL_PRODUCTS: Product[] = STORES.flatMap((s) => s.products);
export const productById = (id: string) => ALL_PRODUCTS.find((p) => p.id === id);

export function placeName(ref: PlaceRef): string {
  if (ref.kind === 'store') return storeById(ref.id)?.name ?? ref.id;
  if (ref.kind === 'restaurant') return restaurantById(ref.id)?.name ?? ref.id;
  return facilityById(ref.id)?.name ?? ref.id;
}

export function refForPlaceId(id: string): PlaceRef | undefined {
  if (storeById(id)) return { kind: 'store', id };
  if (restaurantById(id)) return { kind: 'restaurant', id };
  if (facilityById(id)) return { kind: 'facility', id };
  return undefined;
}

/** A point just inside a store's doorway. */
export function storeInside(s: Store) {
  const dir = s.side === 'north' ? -1 : 1;
  return { x: s.doorX, z: (s.side === 'north' ? s.rect.z2 : s.rect.z1) + dir * 4 };
}

/** A point on the concourse just outside a store's doorway. */
export function storeOutside(s: Store) {
  return { x: s.doorX, z: s.side === 'north' ? -5 : 5 };
}

/** Where route guidance for a place should finish. */
export function placeTarget(ref: PlaceRef): { x: number; z: number } {
  if (ref.kind === 'store') {
    const s = storeById(ref.id)!;
    return storeInside(s);
  }
  if (ref.kind === 'restaurant') {
    const r = restaurantById(ref.id)!;
    return { x: r.x, z: r.z - 3.5 };
  }
  const f = facilityById(ref.id)!;
  return f.approach ?? { x: f.x, z: f.z };
}

export function locationText(ref: PlaceRef): string {
  if (ref.kind === 'store') {
    const s = storeById(ref.id)!;
    const neighbour = s.side === 'north' ? 'north side of the main concourse' : 'south side of the main concourse';
    return `Ground floor, unit ${s.unit} — ${neighbour}`;
  }
  if (ref.kind === 'restaurant') {
    const r = restaurantById(ref.id)!;
    return `Ground floor, Food Court, unit ${r.unit}`;
  }
  return 'Ground floor';
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function hoursRows(hours: WeekHours) {
  // Present Monday-first.
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: DAY_NAMES[d],
    text: hours[d] ? `${fmtTime(hours[d]![0])} – ${fmtTime(hours[d]![1])}` : 'Closed',
    today: d === new Date().getDay(),
  }));
}

export function openStatus(hours: WeekHours, now = new Date()): { open: boolean; text: string } {
  const today = hours[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  if (today && mins >= toMin(today[0]) && mins < toMin(today[1])) {
    return { open: true, text: `Open now · closes ${fmtTime(today[1])}` };
  }
  if (today && mins < toMin(today[0])) return { open: false, text: `Closed · opens ${fmtTime(today[0])}` };
  const tomorrow = hours[(now.getDay() + 1) % 7];
  return { open: false, text: tomorrow ? `Closed · opens ${fmtTime(tomorrow[0])} tomorrow` : 'Closed' };
}

export const money = (n: number) =>
  n % 1 === 0 ? `$${n.toLocaleString('en-AU')}` : `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;

export function promotionsFor(placeId: string) {
  return PROMOTIONS.filter((p) => p.placeId === placeId);
}

/** Which area of the centre a floor point is in, for the "you are here" label. */
export function areaAt(x: number, z: number): { label: string; storeId?: string } {
  for (const s of STORES) {
    const r = s.rect;
    if (x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2) return { label: `Inside ${s.name}`, storeId: s.id };
  }
  const fc = CENTRE.foodCourt;
  if (x > fc.x1 && x < fc.x2 && z > fc.z1 && z < fc.z2) return { label: 'Food Court' };
  const sh = CENTRE.southHall;
  if (x > sh.x1 && x < sh.x2 && z > sh.z1) return { label: 'South Entrance hall' };
  const am = CENTRE.amenities;
  if (z < am.z2) return { label: 'Amenities (restrooms & lifts)' };
  // Nearest storefront along the concourse.
  let best = STORES[0];
  let bestD = Infinity;
  for (const s of STORES) {
    const d = Math.hypot(s.doorX - x, (s.side === 'north' ? -7 : 7) - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (Math.abs(x) < 7) return { label: 'Central atrium' };
  if (x > 26 && z > 0) return { label: 'Concourse — beside the Food Court' };
  return { label: `Concourse — near ${best.name}` };
}
