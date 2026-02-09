import React from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { Button } from '@/shared/components/ui/button';
import { Trophy } from 'lucide-react';

interface LeaderboardRow {
    rank: number;
    userName: string;
    weeklyReturn: number;
}

interface WeeklyLeaderboardDialogProps {
    open: boolean;
    onClose: () => void;
}

/**
 * MOCK DATA — replace later with backend data
 */
const mockLeaderboard: LeaderboardRow[] = [
    { rank: 1, userName: 'Alex Johnson', weeklyReturn: 12.45 },
    { rank: 2, userName: 'Sam Williams', weeklyReturn: 8.21 },
    { rank: 3, userName: 'Jordan Lee', weeklyReturn: 5.02 },
    { rank: 4, userName: 'Chris Patel', weeklyReturn: 3.11 },
    { rank: 5, userName: 'Pat Morgan', weeklyReturn: 1.04 },
];

const getRankDisplay = (rank: number) => {
    if (rank === 1) return <span className="text-yellow-400 text-lg">🥇</span>;
    if (rank === 2) return <span className="text-gray-300 text-lg">🥈</span>;
    if (rank === 3) return <span className="text-orange-400 text-lg">🥉</span>;
    return <span className="text-gray-400 font-medium">{rank}</span>;
};

const WeeklyLeaderboardDialog: React.FC<WeeklyLeaderboardDialogProps> = ({
    open,
    onClose,
}) => {
    const hasData = mockLeaderboard.length > 0;

    return (
        <AlertDialog open={open} onOpenChange={onClose}>
            <AlertDialogContent
                className="
          bg-gray-900 border border-gray-700 text-white w-full
          max-w-[95%]
          sm:max-w-[90%]
          md:max-w-[85%]
          lg:max-w-[70%]
          xl:max-w-[60%]
        "
            >
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-white">
                        <Trophy className="w-6 h-6 text-yellow-400" />
                        This Week&apos;s Leaderboard Rankings
                    </AlertDialogTitle>
                </AlertDialogHeader>

                {/* CONTENT */}
                <div className="mt-4">
                    {!hasData && (
                        <div className="py-12 text-center text-gray-400">
                            No rankings yet this week. Trading is still open.
                        </div>
                    )}

                    {hasData && (
                        <>
                            {/* DESKTOP TABLE */}
                            <div className="hidden sm:block overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-700">
                                            <th className="px-4 py-2 text-center text-sm text-gray-400">
                                                Rank
                                            </th>
                                            <th className="px-4 py-2 text-left text-sm text-gray-400">
                                                User
                                            </th>
                                            <th className="px-4 py-2 text-right text-sm text-gray-400">
                                                Weekly Return
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mockLeaderboard.map((row) => (
                                            <tr
                                                key={row.rank}
                                                className="border-b border-gray-800 last:border-b-0"
                                            >
                                                <td className="px-4 py-3 text-center">
                                                    {getRankDisplay(row.rank)}
                                                </td>
                                                <td className="px-4 py-3 font-medium truncate">
                                                    {row.userName}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold text-green-400">
                                                    +{row.weeklyReturn.toFixed(2)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* MOBILE LIST */}
                            <div className="sm:hidden">
                                {/* Mobile Header */}
                                <div className="sticky top-0 z-10 mb-2">
                                    <div className="grid grid-cols-[48px_1fr_80px] px-3 py-1.5 text-[11px] font-semibold text-gray-400 border-b border-gray-700">
                                        <div className="text-center">Rank</div>
                                        <div className="text-left">User</div>
                                        <div className="text-right">Return</div>
                                    </div>
                                </div>

                                {/* Mobile Rows */}
                                <div className="space-y-2">
                                    {mockLeaderboard.map((row) => (
                                        <div
                                            key={row.rank}
                                            className="grid grid-cols-[48px_1fr_80px] items-center px-3 py-2 rounded-lg bg-gray-800/60"
                                        >
                                            {/* Rank */}
                                            <div className="flex justify-center">
                                                {getRankDisplay(row.rank)}
                                            </div>

                                            {/* User */}
                                            <div className="font-medium truncate">
                                                {row.userName}
                                            </div>

                                            {/* Return */}
                                            <div className="text-right font-mono font-semibold text-green-400">
                                                +{row.weeklyReturn.toFixed(2)}%
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* CLOSE ACTION */}
                            <div className="mt-6 flex justify-end">
                                <Button
                                    variant="outline"
                                    onClick={onClose}
                                    className="border-gray-700 text-gray-200 hover:bg-gray-800"
                                >
                                    Close
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default WeeklyLeaderboardDialog;