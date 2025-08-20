import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { formatCurrency, formatPercent } from '../lib/formatters';
import { MatchHistoryModal } from './MatchHistoryModal';
import { PurchaseConfirmationModal } from './PurchaseConfirmationModal';

export const ClubValuesPage: React.FC = () => {
  const { clubs, matches, purchaseClub } = useAppContext();
  const [purchaseUnits, setPurchaseUnits] = useState<Record<string, number>>({});
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [confirmationData, setConfirmationData] = useState<{
    clubId: string;
    clubName: string;
    shares: number;
    pricePerShare: number;
    totalValue: number;
  } | null>(null);
  // Function to count games played for a club
  const getGamesPlayed = (clubName: string): number => {
    return matches.filter(match => 
      match.homeTeam === clubName || match.awayTeam === clubName
    ).length;
  };
  // Function to get the latest ending value for a club from matches
  const getLatestClubValue = (clubName: string, launchValue: number): number => {
    // Find all matches where this club participated
    const clubMatches = matches.filter(match => 
      match.homeTeam === clubName || match.awayTeam === clubName
    );
    
    if (clubMatches.length === 0) {
      return launchValue; // No matches, return launch value
    }
    
    // Get the most recent match (first in array since matches are sorted newest first)
    const latestMatch = clubMatches[0];
    return latestMatch.homeTeam === clubName ? latestMatch.homeEndValue : latestMatch.awayEndValue;
  };

  const updateUnits = (clubId: string, units: number) => {
    setPurchaseUnits(prev => ({ ...prev, [clubId]: Math.max(1, Math.min(10, units)) }));
  };
  const handlePurchaseClick = (clubId: string) => {
    const club = clubs.find(c => c.id === clubId);
    if (!club) return;
    
    const units = purchaseUnits[clubId] || 1;
    const pricePerShare = getLatestClubValue(club.name, 20);
    const totalValue = units * pricePerShare;
    
    setConfirmationData({
      clubId,
      clubName: club.name,
      shares: units,
      pricePerShare,
      totalValue
    });
  };
  
  const confirmPurchase = () => {
    if (!confirmationData) return;
    
    purchaseClub(confirmationData.clubId, confirmationData.shares);
    setPurchaseUnits(prev => ({ ...prev, [confirmationData.clubId]: 1 }));
    setConfirmationData(null);
  };
  return (
    <div className="p-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-2xl">Marketplace</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Club</th>
                  <th className="text-right p-2">Games Played</th>
                  <th className="text-right p-2">Launch</th>
                  <th className="text-right p-2">Current</th>
                  <th className="text-right p-2">P/L</th>
                  <th className="text-right p-2">Change</th>
                  <th className="text-right p-2">Market Cap</th>
                  <th className="text-center p-2">Units</th>
                  <th className="text-center p-2">Buy</th>
                </tr>
              </thead>
              <tbody>
                {clubs
                  .map(club => {
                    const launchPrice = 20; // Fixed launch price from Launch page
                    const currentValue = getLatestClubValue(club.name, launchPrice);
                    const profitLoss = currentValue - launchPrice;
                    const percentChange = ((currentValue - launchPrice) / launchPrice) * 100;
                    const marketCap = currentValue * 1000000;
                    
                    return {
                      ...club,
                      currentValue,
                      profitLoss,
                      percentChange,
                      marketCap
                    };
                  })
                  .sort((a, b) => b.marketCap - a.marketCap) // Sort by market cap descending
                  .map((club, index) => (
                    <tr key={club.id} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="p-2 text-gray-400">{index + 1}</td>
                      <td className="p-2 font-medium">{club.name}</td>
                      <td 
                        className="p-2 text-right text-blue-400 font-medium cursor-pointer hover:text-blue-300"
                        onClick={() => setSelectedClub(club.name)}
                      >
                        {getGamesPlayed(club.name)}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(20)}</td>
                      <td className="p-2 text-right">{formatCurrency(club.currentValue)}</td>
                      <td className={`p-2 text-right ${club.profitLoss === 0 ? 'text-gray-400' : club.profitLoss > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(club.profitLoss)}
                      </td>
                      <td className={`p-2 text-right ${club.percentChange === 0 ? 'text-gray-400' : club.percentChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPercent(club.percentChange)}
                      </td>
                       <td className="p-2 text-right">{formatCurrency(club.marketCap)}</td>
                      <td className="p-2 text-center">
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          value={purchaseUnits[club.id] || 1}
                          onChange={(e) => updateUnits(club.id, parseInt(e.target.value) || 1)}
                          className="w-14 bg-gray-700 border-gray-600 text-white text-center text-xs"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Button
                           onClick={() => handlePurchaseClick(club.id)}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-xs px-2 py-1"
                        >
                          Buy
                        </Button>
                      </td>
                    </tr>
                  ))}

              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <MatchHistoryModal
        isOpen={selectedClub !== null}
        onClose={() => setSelectedClub(null)}
        clubName={selectedClub || ''}
      />
      
      <PurchaseConfirmationModal
        isOpen={confirmationData !== null}
        onClose={() => setConfirmationData(null)}
        onConfirm={confirmPurchase}
        clubName={confirmationData?.clubName || ''}
        shares={confirmationData?.shares || 0}
        pricePerShare={confirmationData?.pricePerShare || 0}
        totalValue={confirmationData?.totalValue || 0}
      />
    </div>
  );
};

export default ClubValuesPage;