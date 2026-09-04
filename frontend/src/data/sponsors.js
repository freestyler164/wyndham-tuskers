export const sponsors = [
  {
    id: 'maxlend',
    name: 'Maxlend',
    tier: 'Platinum sponsor',
    category: 'Finance & Mortgage',
    logoUrl: '/static/logos/maxlend_logo.jpeg',
    description: 'Helping first home buyers, refinancers and property investors find the right home loan with personalised advice and access to a wide range of lenders.',
    contactLabel: 'Sreerej Premra',
    phone: '0402614219',
  },
  {
    id: 'hqrealtors',
    name: 'HQRealtors',
    tier: 'Silver sponsor',
    category: 'Real Estate',
    logoUrl: '/static/logos/hqr-logo.jpeg',
    description: 'Helping buyers, sellers, landlords and investors achieve their property goals with trusted local expertise and personalised real estate services.',
    contactLabel: 'Office 309, 89 Overton Road, Williams Landing, VIC 3027',
    phone: '0433601248',
  },
  {
    id: 'eco-loans',
    name: 'Eco Loans',
    tier: 'Silver sponsor',
    category: 'Finance & Mortgage',
    logoUrl: '/static/logos/eco_loans.jpg',
    description: 'Helping individuals and families secure the right finance solutions with personalised lending advice for home, vehicle and personal loans.',
    contactLabel: 'Eco Loans',
    phone: '0491615504',
  },
  {
    id: 'reliance-real-estate',
    name: 'Reliance Real Estate',
    tier: 'Gold sponsor',
    category: 'Real Estate',
    logoUrl: '/static/logos/reliance_logo.jpg',
    description: "Helping buyers, sellers, landlords and investors achieve their property goals with trusted advice, local expertise and personalised service across Melbourne's western suburbs.",
    contactLabel: 'Harsha',
    phone: '+61444512647',
    email: 'Harsha@reliancere.com.au',
  },
];

export const phoneHref = (phone) => `tel:${String(phone || '').replace(/\s+/g, '')}`;

export const whatsappHref = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const international = digits.startsWith('0') ? `61${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
};
