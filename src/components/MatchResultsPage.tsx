import React, { useContext } from 'react';
import { AppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatPercent } from '@/lib/formatters';

const MatchResultsPage: React.FC = () => {
  const { matches, simulateMatch } = useContext(AppContext);

  return (
    <div className="p-6">
      <Card className="bg-gray-800 border-gray-700 mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white text-2xl">Match Results</CardTitle>
          <Button onClick={simulateMatch} className="bg-green-600 hover:bg-green-700">
            Simulate Match
          </Button>
        </CardHeader>
      </Card>

      {matches.length === 0 ? (
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-8 text-center">
            <p className="text-gray-400">No matches yet. Click "Simulate Match" to start!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <Card key={match.id} className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-white">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left p-3">Date</th>
                        <th className="text-left p-3">Team</th>
                        <th className="text-center p-3">Score</th>
                        <th className="text-right p-3">Starting Value</th>
                        <th className="text-right p-3">% Change</th>
                        <th className="text-right p-3">Profit</th>
                        <th className="text-right p-3">Ending Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-600">
                        <td className="p-3 text-gray-400">{match.date}</td>
                        <td className="p-3 font-medium">{match.homeTeam}</td>
                        <td className="p-3 text-center text-2xl font-bold">{match.homeScore}</td>
                        <td className="p-3 text-right">{formatCurrency(match.homeStartValue)}</td>
                        <td className={`p-3 text-right ${match.homeChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(match.homeChange)}
                        </td>
                        <td className={`p-3 text-right ${match.homeProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(match.homeProfit)}
                        </td>
                        <td className="p-3 text-right">{formatCurrency(match.homeEndValue)}</td>
                      </tr>
                      <tr>
                        <td className="p-3 text-gray-400"></td>
                        <td className="p-3 font-medium">{match.awayTeam}</td>
                        <td className="p-3 text-center text-2xl font-bold">{match.awayScore}</td>
                        <td className="p-3 text-right">{formatCurrency(match.awayStartValue)}</td>
                        <td className={`p-3 text-right ${match.awayChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(match.awayChange)}
                        </td>
                        <td className={`p-3 text-right ${match.awayProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(match.awayProfit)}
                        </td>
                        <td className="p-3 text-right">{formatCurrency(match.awayEndValue)}</td>
                      </tr>
                    </tbody>

                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MatchResultsPage;