import React, { useState } from 'react';
import { TeamOrdersModal } from './TeamOrdersModal';

interface TeamCardProps {
  team: {
    id: number;
    name: string;
    market_cap: number;
    shares_outstanding: number;
  };
}

export const TeamCardWithOrders: React.FC<TeamCardProps> = ({ team }) => {
  const [showOrdersModal, setShowOrdersModal] = useState(false);

  return (
    <>
      {/* Team Card */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{team.name}</h3>
          <button
            onClick={() => setShowOrdersModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium"
          >
            View Orders
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Market Cap</p>
            <p className="text-lg font-bold text-gray-900">${team.market_cap.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Share Price</p>
            <p className="text-lg font-bold text-green-600">
              ${(team.market_cap / team.shares_outstanding).toFixed(2)}
            </p>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Shares Outstanding:</span>
            <span className="font-medium">{team.shares_outstanding.toLocaleString()}</span>
          </div>
          
          <div className="mt-1">
            <button
              onClick={() => setShowOrdersModal(true)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Click for orders & market cap impact →
            </button>
          </div>
        </div>
      </div>

      {/* Orders Modal */}
      <TeamOrdersModal
        teamId={team.id}
        teamName={team.name}
        isOpen={showOrdersModal}
        onClose={() => setShowOrdersModal(false)}
      />
    </>
  );
};

// Usage example:
/*
const ExampleUsage = () => {
  const teams = [
    { id: 37, name: 'Brighton & Hove Albion FC', market_cap: 1200000, shares_outstanding: 60000 },
    { id: 22, name: 'Aston Villa FC', market_cap: 850000, shares_outstanding: 42500 }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {teams.map(team => (
        <TeamCardWithOrders key={team.id} team={team} />
      ))}
    </div>
  );
};
*/
