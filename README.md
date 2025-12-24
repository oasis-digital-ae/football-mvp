# Football MVP - Premier League Trading Platform

A React-based trading platform for Premier League football clubs, built with TypeScript, Vite, and Supabase.

## Features

- **Live Trading**: Buy and sell shares in Premier League clubs
- **Real-time Market Data**: Market caps update based on match results
- **Portfolio Management**: Track your investments and performance
- **Match Simulation**: Simulate season results and see market impact
- **Team Details**: View detailed team information and statistics
- **Transaction History**: Complete audit trail of all trades

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: Tailwind CSS, Radix UI Components
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **API**: Football Data API v4
- **Deployment**: Netlify

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account
- Football Data API key

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd football-mvp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your actual values
   ```

4. **Set up the database**
   - Go to your Supabase dashboard
   - Run migrations from `supabase/migrations/` directory in chronological order
   - See `src/config/database/README.md` for detailed setup instructions

5. **Start the development server**
   ```bash
   npm run dev
   ```

## Deployment to Netlify

### Method 1: Git Integration (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Netlify**
   - Go to [Netlify](https://netlify.com)
   - Click "New site from Git"
   - Connect your GitHub repository
   - Netlify will auto-detect the build settings from `netlify.toml`

3. **Set Environment Variables**
   - Go to Site settings > Environment variables
   - Add the variables from `netlify-env-example.txt`

4. **Deploy**
   - Netlify will automatically build and deploy
   - Your site will be available at `https://your-site-name.netlify.app`

### Method 2: Manual Deploy

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**
   - Go to [Netlify](https://netlify.com)
   - Drag and drop the `dist` folder
   - Set environment variables in site settings

## Environment Variables

### Required Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Football Data API
VITE_FOOTBALL_API_KEY=your_football_api_key

# Application Configuration
VITE_APP_ENV=production
VITE_DEBUG_MODE=false
```

## Database Setup

The application uses Supabase with the following main tables:

- `profiles` - User profiles
- `teams` - Football teams with market cap data
- `fixtures` - Match fixtures and results
- `orders` - User purchase orders
- `positions` - User share holdings (with transaction history)
- `transfers_ledger` - Market cap transfers from match results
- `audit_log` - System audit trail

See `src/config/database/README.md` for detailed setup instructions.

## Project Structure

```
src/
├── app/                 # App entry point
├── components/          # Reusable components
├── config/             # Configuration files
│   └── database/       # Database migrations
├── features/           # Feature-based modules
│   ├── auth/          # Authentication
│   ├── layout/        # App layout
│   └── trading/       # Trading features
├── pages/             # Page components
└── shared/            # Shared utilities
    ├── components/    # Shared UI components
    ├── lib/          # Utility libraries
    └── types/        # TypeScript types
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
