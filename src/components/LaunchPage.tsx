import React from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatters';

const LaunchPage: React.FC = () => {
  const { clubs } = useAppContext();

  return (
    <div className="p-6">
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white text-2xl">Launch Prices</CardTitle>
          <p className="text-gray-400">Initial launch prices for all clubs</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700">
                <TableHead className="text-gray-300">Club</TableHead>
                <TableHead className="text-gray-300">Launch Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clubs.map((club) => (
                <TableRow key={club.id} className="border-gray-700 hover:bg-gray-700">
                  <TableCell className="text-white font-medium">{club.name}</TableCell>
                  <TableCell className="text-white">{formatCurrency(20)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LaunchPage;