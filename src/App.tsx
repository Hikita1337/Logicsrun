import React, { useEffect, useState } from 'react';
import { 
  Trophy, 
  TrendingUp, 
  BarChart3,
  Activity,
  Timer,
  Loader2,
  Hash,
  Download,
  Sun,
  Moon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

const StatCard = ({ title, value, icon: Icon, color }: any) => {
  // Extract the color name from the class (e.g., "bg-indigo-500" -> "indigo")
  // This is a bit hacky but keeps the API similar. 
  // Better to just pass the color name "indigo" but let's stick to the existing pattern if possible or just fix the opacity.
  // Actually, let's just use the slash syntax for opacity if we can.
  // But we can't easily append /10 to a prop string.
  // Let's assume color is passed as "indigo" instead.
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm dark:shadow-none transition-colors duration-300"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg bg-${color}-500/10`}>
          <Icon className={`w-5 h-5 text-${color}-500`} />
        </div>
      </div>
      <h3 className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-semibold text-zinc-900 dark:text-white transition-colors duration-300">{value}</p>
    </motion.div>
  );
};

const DistributionBar = ({ label, value, total, color }: any) => {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-600 dark:text-zinc-300 transition-colors duration-300">{label}</span>
        <span className="font-mono text-zinc-500 dark:text-zinc-400 transition-colors duration-300">{value} ({percentage}%)</span>
      </div>
      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden transition-colors duration-300">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full ${color} rounded-full`} 
        />
      </div>
    </div>
  );
};

const Countdown = ({ finishAt }: { finishAt: string | null }) => {
  const [timeLeft, setTimeLeft] = useState<string>('...');
  const [status, setStatus] = useState<'active' | 'waiting'>('active');

  useEffect(() => {
    if (!finishAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const end = new Date(finishAt).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setStatus('waiting');
        setTimeLeft('Ожидание нового раунда...');
      } else {
        setStatus('active');
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`До конца розыгрыша: ${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [finishAt]);

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-colors duration-300 ${
      status === 'active' 
        ? 'bg-zinc-100 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800' 
        : 'bg-amber-500/10 border-amber-500/20'
    }`}>
      {status === 'active' ? (
        <Timer className="w-5 h-5 text-emerald-500" />
      ) : (
        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
      )}
      <span className={`font-mono font-medium transition-colors duration-300 ${
        status === 'active' ? 'text-zinc-700 dark:text-zinc-200' : 'text-amber-600 dark:text-amber-500'
      }`}>
        {timeLeft}
      </span>
    </div>
  );
};

export default function App() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved ? saved === 'dark' : true; // Default to dark
    }
    return true;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
      setError(error.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000); // Polling every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const handleDownload = () => {
    window.location.href = '/api/download';
  };

  const chartData = React.useMemo(() => {
    if (!stats?.intervalStats) return [];

    // We want 6 blocks: 0-4, 4-8, 8-12, 12-16, 16-20, 20-24 (Local Time)
    return [0, 4, 8, 12, 16, 20].map(startHour => {
      const endHour = startHour + 4;
      let totalUsers = 0;
      let totalTickets = 0;
      let totalCount = 0;

      // Aggregate data for the 4 hours in this block
      for (let i = 0; i < 4; i++) {
        const localHour = startHour + i;
        
        // Create a date object for "Today, localHour:00" to get the corresponding UTC hour
        const d = new Date();
        d.setHours(localHour, 0, 0, 0);
        const utcHour = d.getUTCHours();
        
        const stat = stats.intervalStats.find((s: any) => s.hour === utcHour);
        if (stat) {
          totalUsers += stat.avgUsers * stat.count;
          totalTickets += stat.avgTicket * stat.count;
          totalCount += stat.count;
        }
      }

      const timeLabel = `${startHour.toString().padStart(2, '0')}:00 - ${endHour.toString().padStart(2, '0')}:00`;

      return {
        hour: timeLabel,
        avgUsers: totalCount > 0 ? Math.round(totalUsers / totalCount) : 0,
        avgTicket: totalCount > 0 ? Math.round(totalTickets / totalCount) : 0
      };
    });
  }, [stats]);

  if (loading && !stats && !error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-zinc-500 dark:text-zinc-400 animate-pulse">Загрузка статистики...</p>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white flex items-center justify-center transition-colors duration-300">
        <div className="flex flex-col items-center gap-4 p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-red-500/20">
          <div className="p-3 bg-red-500/10 rounded-full">
            <Activity className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-red-500">Ошибка загрузки</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-center max-w-xs">{error}</p>
          <button 
            onClick={() => { setLoading(true); fetchStats(); }}
            className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 p-4 md:p-8 font-sans transition-colors duration-300 flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex-grow">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black tracking-tighter text-indigo-600 dark:text-white transition-colors duration-300">
                CsgoRun
              </span>
              <span className="text-lg md:text-xl font-medium text-zinc-600 dark:text-zinc-400 transition-colors duration-300">
                розыгрыш на 5$
              </span>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mr-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span className="hidden lg:inline">Мониторинг активен</span>
            </div>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-xl border transition-all duration-300 ${
                darkMode 
                  ? 'bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-100 shadow-lg shadow-white/10' 
                  : 'bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800 shadow-lg shadow-black/10'
              }`}
              title={darkMode ? "Включить светлую тему" : "Включить темную тему"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300 text-sm font-medium shadow-sm dark:shadow-none"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Скачать код</span>
            </button>
            
            <Countdown finishAt={stats.currentRoundFinishAt} />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            title="Всего раундов" 
            value={stats.totalRounds} 
            icon={Hash} 
            color="indigo"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-none transition-colors duration-300"
          >
            <h2 className="text-lg font-medium mb-6 flex items-center gap-2 text-zinc-900 dark:text-white">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
              Активность по времени (Местное время)
            </h2>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#27272a" : "#e4e4e7"} vertical={false} />
                  <XAxis 
                    dataKey="hour" 
                    stroke={darkMode ? "#71717a" : "#a1a1aa"} 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.split(' - ')[0]}
                  />
                  <YAxis 
                    stroke={darkMode ? "#71717a" : "#a1a1aa"} 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: darkMode ? '#18181b' : '#ffffff', 
                      border: `1px solid ${darkMode ? '#27272a' : '#e4e4e7'}`, 
                      borderRadius: '8px',
                      color: darkMode ? '#fff' : '#000'
                    }}
                    itemStyle={{ color: '#10b981' }}
                    cursor={{ fill: darkMode ? '#27272a' : '#f4f4f5', opacity: 0.4 }}
                  />
                  <Bar dataKey="avgUsers" name="Среднее участников" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill="#10b981" fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-6">
              {chartData.map((item: any) => (
                <div key={item.hour} className="text-center p-2 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800/50 transition-colors duration-300">
                  <p className="text-[10px] text-zinc-500 uppercase mb-1">{item.hour}</p>
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">{item.avgTicket}</p>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-600">Средний билет</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-none transition-colors duration-300"
          >
            <h2 className="text-lg font-medium mb-6 flex items-center gap-2 text-zinc-900 dark:text-white">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Распределение побед
            </h2>
            <div className="space-y-6">
              <DistributionBar 
                label="Начало (0-33%)" 
                value={stats.winDistribution.start} 
                total={stats.totalRounds}
                color="bg-indigo-500"
              />
              <DistributionBar 
                label="Середина (34-66%)" 
                value={stats.winDistribution.mid} 
                total={stats.totalRounds}
                color="bg-violet-500"
              />
              <DistributionBar 
                label="Конец (67-100%)" 
                value={stats.winDistribution.end} 
                total={stats.totalRounds}
                color="bg-fuchsia-500"
              />
            </div>
            <div className="mt-8 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800/50 transition-colors duration-300">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Статистика показывает, в какой части пула билетов чаще всего оказывается выигрышный номер.
              </p>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none transition-colors duration-300"
          >
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-medium flex items-center gap-2 text-zinc-900 dark:text-white">
                <Trophy className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
                Последние победители
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 dark:text-zinc-400 uppercase bg-zinc-50 dark:bg-zinc-950/50 transition-colors duration-300">
                  <tr>
                    <th className="px-6 py-3 font-medium">Пользователь</th>
                    <th className="px-6 py-3 font-medium">Время победы</th>
                    <th className="px-6 py-3 font-medium">Билет</th>
                    <th className="px-6 py-3 font-medium">Позиция</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  <AnimatePresence>
                    {stats.recentRounds.map((r: any) => {
                      const ratio = r.ticket / r.users_count;
                      let pos = "Начало";
                      if (ratio > 0.66) pos = "Конец";
                      else if (ratio > 0.33) pos = "Середина";
                      
                      return (
                        <motion.tr 
                          key={r.round_id} 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                {r.user_avatar ? (
                                  <img 
                                    src={r.user_avatar} 
                                    alt="" 
                                    className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 object-cover" 
                                    referrerPolicy="no-referrer" 
                                    onError={(e: any) => {
                                      e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user_name || 'U')}&background=27272a&color=fff`;
                                    }}
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">?</div>
                                )}
                              </div>
                              <span className="font-medium text-zinc-900 dark:text-zinc-200 truncate max-w-[120px]" title={r.user_name}>
                                {r.user_name || r.user_id}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                            {new Date(r.finish_at || r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                            {r.ticket} <span className="text-zinc-400 dark:text-zinc-500 text-xs font-normal">/ {r.users_count}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                              pos === 'Начало' ? 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20' :
                              pos === 'Середина' ? 'bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20' :
                              'bg-fuchsia-100 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-200 dark:border-fuchsia-500/20'
                            }`}>
                              {pos}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none transition-colors duration-300"
          >
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-lg font-medium flex items-center gap-2 text-zinc-900 dark:text-white">
                <Trophy className="w-5 h-5 text-amber-500" />
                Топ 10 победителей
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 dark:text-zinc-400 uppercase bg-zinc-50 dark:bg-zinc-950/50 transition-colors duration-300">
                  <tr>
                    <th className="px-6 py-3 font-medium">Место</th>
                    <th className="px-6 py-3 font-medium">Пользователь</th>
                    <th className="px-6 py-3 font-medium text-right">Побед</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {stats.topWinners?.map((w: any, idx: number) => (
                    <tr key={w.user_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-200">
                      <td className="px-6 py-4 font-mono text-zinc-500 dark:text-zinc-400">
                        <span className={idx < 3 ? 'text-amber-500 font-bold' : ''}>#{idx + 1}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {w.user_avatar ? (
                            <img 
                              src={w.user_avatar} 
                              alt="" 
                              className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 object-cover" 
                              referrerPolicy="no-referrer"
                              onError={(e: any) => {
                                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(w.user_name || 'U')}&background=27272a&color=fff`;
                              }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">?</div>
                          )}
                          <span className="font-medium text-zinc-900 dark:text-zinc-200 truncate max-w-[150px]" title={w.user_name}>
                            {w.user_name || w.user_id}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400 text-right font-bold">{w.wins}</td>
                    </tr>
                  ))}
                  {(!stats.topWinners || stats.topWinners.length === 0) && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-zinc-500 dark:text-zinc-500">
                        Пока нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>

      <footer className="mt-12 py-6 text-center border-t border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono tracking-wider uppercase">
          Author of the project ₡₳Х₳₱Ǿ₭
        </p>
      </footer>
    </div>
  );
}
