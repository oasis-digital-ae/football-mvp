# Football MVP Deployment Guide

## Prerequisites
- Node.js 18+ installed
- Netlify CLI installed globally: `npm install -g netlify-cli`

## Local Development with Netlify Dev

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Copy `.env.example` to `.env.local`
   - Fill in your Supabase credentials

3. **Start development server:**
   ```bash
   netlify dev
   ```
   This will:
   - Run the Vite dev server on port 5173
   - Enable Netlify's dev features (functions, redirects, etc.)
   - Auto-launch in your browser

## Netlify Deployment

### Option 1: One-click deploy
1. Push your code to GitHub/GitLab
2. Connect repository to Netlify
3. Netlify will auto-detect settings from `netlify.toml`

### Option 2: Manual deploy
```bash
# Build the project
npm run build

# Deploy to Netlify
netlify deploy --prod --dir=dist
```

## Features Ready for Production

✅ **Responsive Design**
- Mobile-first approach
- Chart adapts to screen size
- Touch-friendly buttons

✅ **Error Handling**
- Graceful loading states
- Error boundaries for data fetching
- Fallback content when data is unavailable

✅ **Performance**
- Code splitting for optimal bundles  
- Minimal JavaScript execution
- Optimized assets

✅ **Database Integration**
- Real-time data from Supabase
- Proper error handling for API calls
- Consistent data types

✅ **UI/UX Standards**
- Clean, professional design
- Accessible components
- Smooth user interactions

## Environment Variables Required

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Notes

- Chart automatically adapts chart width based on screen size
- All animations are subtle and professional
- Build output is optimized for modern browsers
- Mobile tabs use shortened labels (Matches/Orders/Chart)
