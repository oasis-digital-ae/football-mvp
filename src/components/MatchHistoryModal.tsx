import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { formatCurrency } from '../lib/formatters';

interface MatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubName: string;
}

export const MatchHistoryModal: React.FC<MatchHistoryModalProps> = ({
  isOpen,
  onClose,
  clubName
}) => {
  const { matches } = useAppContext();

  const clubMatches = matches.filter(match => 
    match.homeTeam === clubName || match.awayTeam === clubName
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{clubName} - Match History</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {clubMatches.length === 0 ? (
            <p className="text-gray-400 text-center py-4">No matches played yet</p>
          ) : (
            <div className="space-y-2">
              {clubMatches.map((match, index) => {
                const isHome = match.homeTeam === clubName;
                const opponent = isHome ? match.awayTeam : match.homeTeam;
                const score = `${match.homeScore}-${match.awayScore}`;
                const startValue = isHome ? match.homeStartValue : match.awayStartValue;
                const endValue = isHome ? match.homeEndValue : match.awayEndValue;
                const change = endValue - startValue;
                
                return (
                  <div key={index} className="bg-gray-700 p-3 rounded text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">vs {opponent}</span>
                      <span className="text-gray-300">{score}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Start: {formatCurrency(startValue)}</span>
                      <span>End: {formatCurrency(endValue)}</span>
                      <span className={change >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {change >= 0 ? '+' : ''}{formatCurrency(change)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};