export const THESIS_BOM = [
  { item: 'Raspberry Pi 3 Model B (1 GB)', qty: '1', cost: '₱4,849', costPhp: 4849, spec: 'BCM2837, 40-pin GPIO, CSI, Wi-Fi' },
  { item: 'Pi Camera Module 3 NoIR', qty: '1', cost: '₱2,191', costPhp: 2191, spec: 'Sony IMX708 11.9MP, No IR-Cut, CSI-2' },
  { item: '850 nm IR Illuminator (4-LED)', qty: '1', cost: '₱517', costPhp: 517, spec: '12V DC, 10–40 m Night Vision' },
  { item: 'Benewake TF-Luna ToF LiDAR', qty: '1', cost: '₱1,650', costPhp: 1650, spec: '0.2–8 m Range, UART, 850 nm ToF (1 cm res)' },
  { item: 'Custom Aquarium w/ Pump', qty: '1', cost: '₱6,500', costPhp: 6500, spec: 'Stepped-Weir Flume + Submersible Pump' },
  { item: 'Aquarium Wave Makers', qty: '2', cost: '₱420', costPhp: 420, spec: 'Controlled Surface Turbulence' },
  { item: '32 GB microSD Card (Class 10)', qty: '1', cost: '₱399', costPhp: 399, spec: 'Raspberry Pi OS & Local Logs' },
  { item: 'DS3231 Precision RTC Module', qty: '1', cost: '₱180', costPhp: 180, spec: 'I2C TCXO + CR2032 Backup' },
  { item: 'External 2.5" SATA SSD', qty: '1', cost: '₱2,003', costPhp: 2003, spec: 'USB 2.0 Video & SQLite Archive' },
  { item: 'LM2596 DC-DC Buck Converter', qty: '1', cost: '₱125', costPhp: 125, spec: 'Regulated 5.1 V DC Rail' },
  { item: '12V Regulated DC-DC Converter', qty: '1', cost: '₱155', costPhp: 155, spec: 'Buck-Boost for 850nm IR Array' },
  { item: '3S2P Li-ion (4S LiFePO4 Alt.)', qty: '1', cost: '₱547', costPhp: 547, spec: '11.1V 3S2P w/ 3S BMS (~6 Ah)' },
  { item: '5 A Inline Fuse Holder', qty: '1', cost: '₱50', costPhp: 50, spec: 'Battery Positive Overcurrent Guard' },
  { item: 'PVC/Al Mounting Bracket', qty: '1', cost: '₱539', costPhp: 539, spec: 'Upper Bound (₱229–₱539); Height/Angle Gantry' },
  { item: 'IP65 Weatherproof Enclosures', qty: '2', cost: 'Custom', costPhp: 0, spec: 'Dust & Water-Jet Protected CAD' },
  { item: 'JST GH 1.25mm & Harnesses', qty: '2', cost: '₱153', costPhp: 153, spec: 'Color-Coded Power & Sensor Bus' },
];

export const THESIS_BOM_TOTAL_PHP = THESIS_BOM.reduce((sum, r) => sum + (r.costPhp || 0), 0);

export const EDGE_LORA_BOM = [
  { item: 'Raspberry Pi 3 Model B (1 GB)', qty: '1', usd: '$42.00', php: '₱2,425', spec: 'BCM2837 Quad-Core 1.2GHz, 1GB RAM' },
  { item: 'Pi Camera Module 3 NoIR', qty: '1', usd: '$28.00', php: '₱1,617', spec: 'Sony IMX708 11.9MP, CSI-2' },
  { item: 'Benewake TF-Luna ToF LiDAR', qty: '1', usd: '$24.50', php: '₱1,415', spec: '0.2–8m 850nm ToF UART 115200' },
  { item: '850 nm IR Illuminator (4-LED)', qty: '1', usd: '$9.00', php: '₱520', spec: '12V DC 10–40m Range IP65' },
  { item: 'ESP32 DevKit V1 (30-pin)', qty: '1', usd: '$6.50', php: '₱375', spec: 'Dual-Core LX6 UART Bridge' },
  { item: 'Ai-Thinker Ra-02 (SX1278) LoRa', qty: '1', usd: '$6.00', php: '₱346', spec: '433 MHz SPI LoRa + Spring Antenna' },
  { item: 'Custom Stepped-Weir Flume & Pump', qty: '1', usd: '$38.00', php: '₱2,195', spec: 'Acrylic/Glass Flume + Recirc. Pump' },
  { item: 'Aquarium Wave Makers', qty: '2', usd: '$7.50', php: '₱433', spec: 'Surface Turbulence Generators' },
  { item: '32 GB microSD Card (Class 10)', qty: '1', usd: '$6.50', php: '₱375', spec: 'Raspberry Pi OS & Edge Runtime' },
  { item: 'External 2.5" SATA SSD + USB', qty: '1', usd: '$22.00', php: '₱1,270', spec: 'USB 2.0 Video & SQLite Archive' },
  { item: 'DS3231 Precision RTC Module', qty: '1', usd: '$3.00', php: '₱173', spec: 'I2C TCXO + CR2032 Backup' },
  { item: 'LM2596 DC-DC Buck (5.1V)', qty: '1', usd: '$2.00', php: '₱115', spec: 'Regulated 5.1V Pi & LiDAR Rail' },
  { item: '12V Buck-Boost Converter', qty: '1', usd: '$2.50', php: '₱144', spec: 'Stable 12V Rail for 850nm IR' },
  { item: '3S2P 12V Battery Pack w/ BMS', qty: '1', usd: '$11.00', php: '₱635', spec: '12V Pack w/ 3S BMS (~6 Ah)' },
  { item: '5A Inline Fuse Holder & Blade', qty: '1', usd: '$1.00', php: '₱58', spec: 'Overcurrent Guard' },
  { item: 'PVC / Al Mounting Gantry', qty: '1', usd: '$6.50', php: '₱375', spec: 'Adjustable Sensor Mount' },
  { item: 'IP65 Weatherproof Enclosures', qty: '2', usd: '$4.00', php: '₱231', spec: 'Custom Sealed Housings' },
  { item: 'JST GH 1.25mm & Harnesses', qty: '2', usd: '$2.00', php: '₱115', spec: 'Color-Coded Power & Data Bus' },
];

export const BUDGET_ALTERNATIVES = [
  { sub: 'Compute', base: 'Raspberry Pi 3B ($42.00)', alt: 'Raspberry Pi Zero 2 W (512 MB)', cost: '$18.00', save: '-$24.00', note: '512 MB RAM requires smaller YOLO input or swap' },
  { sub: 'Camera', base: 'Pi Cam 3 NoIR ($28.00)', alt: 'OV5647 5MP NoIR Module', cost: '$8.50', save: '-$19.50', note: 'Lower night dynamic range; sufficient for 320x240 LSPIV' },
  { sub: 'WL Sensor', base: 'TF-Luna LiDAR ($24.50)', alt: 'JSN-SR04T Waterproof Ultrasonic', cost: '$4.50', save: '-$20.00', note: 'Wider 75° cone & temp drift vs narrow 2° laser' },
  { sub: 'IR Light', base: '4-LED IR Flood ($9.00)', alt: 'DIY 850nm 12-LED Ring Board', cost: '$4.00', save: '-$5.00', note: 'Shorter range (~10 m vs 25–40 m)' },
  { sub: 'Radio', base: 'ESP32 + Ra-02 ($12.50)', alt: 'Arduino Pro Mini + Ra-02', cost: '$8.50', save: '-$4.00', note: 'No Wi-Fi/BLE fallback; needs 3.3V level shifter' },
  { sub: 'Archive', base: '2.5" SATA SSD ($22.00)', alt: '64 GB High-Endurance microSD', cost: '$10.00', save: '-$12.00', note: 'Lower write endurance over multi-month logging' },
  { sub: 'Battery', base: '3S2P Pack + BMS ($11.00)', alt: '12V 7Ah Sealed Lead Acid (SLA)', cost: '$8.00', save: '-$3.00', note: 'Heavier weight and shorter cycle life' },
  { sub: 'Housing', base: '2x Custom IP65 ($4.00)', alt: 'Upcycled IP65 Junction Box', cost: '$2.50', save: '-$1.50', note: 'Manual drilling & silicone cable glands' },
];
