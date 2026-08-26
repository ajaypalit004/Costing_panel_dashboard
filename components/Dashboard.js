"use client";

import React, { useState, useMemo } from 'react';
import { 
  FileText, CheckCircle2, Clock, IndianRupee, UserCheck, XCircle, TrendingUp, AlertTriangle 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

// --- HELPERS ---
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9', '#6366f1'];

const formatMoney = (val) => {
  if (val >= 10000000) return '₹ ' + (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return '₹ ' + (val / 100000).toFixed(2) + ' L';
  return '₹ ' + val.toLocaleString('en-IN');
};

const leadTypeData = [
  { name: 'HT Panel', value: 45 },
  { name: 'LT Panel', value: 85 },
  { name: 'Bus Duct', value: 30 },
  { name: 'Automation', value: 25 },
  { name: 'Solar', value: 15 },
  { name: 'EPC', value: 10 }
];

// --- COMPONENTS ---
const KpiCard = ({ title, value, icon: Icon, colorClass }) => (
  <div className="glass-card flex items-center justify-between p-3.5 hover:scale-[1.02] transition-all duration-200">
    <div className="min-w-0 pr-2">
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider truncate mb-0.5">{title}</p>
      <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight truncate">{value}</h3>
    </div>
    <div className={`p-2.5 rounded-xl ${colorClass} bg-opacity-20 shrink-0`}>
      <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
    </div>
  </div>
);

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [selectedEngineer, setSelectedEngineer] = useState('All');
  const [selectedSalesPerson, setSelectedSalesPerson] = useState('All');

  React.useEffect(() => {
    fetch('/api/dashboard-data')
      .then(res => res.json())
      .then(data => {
        if (data.leads) setLeads(data.leads);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch dashboard data:", err);
        setLoading(false);
      });
  }, []);

  // Compute unique filter options
  const weeks = useMemo(() => {
    const weekMap = new Map();
    leads.forEach(l => {
      if (l.weekKey && l.weekLabel) {
        weekMap.set(l.weekKey, { key: l.weekKey, label: l.weekLabel });
      }
    });
    return Array.from(weekMap.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [leads]);

  const months = useMemo(() => {
    const m = Array.from(new Set(leads.map(l => l.monthYear))).sort();
    return ['All', ...m];
  }, [leads]);

  const engineers = useMemo(() => {
    const e = Array.from(new Set(leads.map(l => l.engineer))).sort();
    return ['All', ...e];
  }, [leads]);

  const salesPersons = useMemo(() => {
    const s = Array.from(new Set(leads.map(l => l.salesPerson))).sort();
    return ['All', ...s];
  }, [leads]);

  // Apply filters
  const filteredLeads = useMemo(() => {
    const latestWeekKey = weeks.length > 0 ? weeks[0].key : null;

    return leads.filter(l => {
      let matchWeek = true;
      if (selectedWeek === 'LATEST') {
        matchWeek = l.weekKey === latestWeekKey;
      } else if (selectedWeek !== 'All') {
        matchWeek = l.weekKey === selectedWeek;
      }

      const matchMonth = selectedMonth === 'All' || l.monthYear === selectedMonth;
      const matchEng = selectedEngineer === 'All' || l.engineer === selectedEngineer;
      const matchSales = selectedSalesPerson === 'All' || l.salesPerson === selectedSalesPerson;
      return matchWeek && matchMonth && matchEng && matchSales;
    });
  }, [leads, selectedWeek, selectedMonth, selectedEngineer, selectedSalesPerson, weeks]);

  // Compute KPIs & Charts dynamically based on new rules
  const { kpiData, engineerPerformance, salesData, clientSummary, leadAgeing } = useMemo(() => {
    
    let totalAssigned = 0;
    let pending = 0;
    let completed = 0;
    let totalQuoteValue = 0;

    const engMap = {};
    const salesMap = {};
    const monthMap = {};
    const ageingCounts = { '0-2 Days': 0, '3-5 Days': 0, '6-10 Days': 0, '>10 Days': 0 };

    filteredLeads.forEach(lead => {
      totalAssigned += 1;
      totalQuoteValue += lead.offerPrice;

      // RULE: Costing is ONLY pending for these cases
      const isPending = lead.costingStatus === 'pending' || lead.costingStatus === 'revision_in_progress';
      // RULE: For all other cases treat costing is done
      const isCompleted = !isPending;

      if (isPending) pending += 1;
      if (isCompleted) {
        completed += 1;
        if (lead.monthYear) {
          monthMap[lead.monthYear] = (monthMap[lead.monthYear] || 0) + 1;
        }
      }

      // Engineer aggregations
      if (!engMap[lead.engineer]) {
        engMap[lead.engineer] = {
          name: lead.engineer, assigned: 0, completed: 0, pending: 0, totalValue: 0
        };
      }
      engMap[lead.engineer].assigned += 1;
      engMap[lead.engineer].totalValue += lead.offerPrice;
      if (isCompleted) engMap[lead.engineer].completed += 1;
      if (isPending) engMap[lead.engineer].pending += 1;

      // Sales Person aggregations
      if (!salesMap[lead.salesPerson]) {
        salesMap[lead.salesPerson] = {
          name: lead.salesPerson, count: 0
        };
      }
      salesMap[lead.salesPerson].count += 1;

      // Ageing
      if (lead.daysOpen <= 2) ageingCounts['0-2 Days']++;
      else if (lead.daysOpen <= 5) ageingCounts['3-5 Days']++;
      else if (lead.daysOpen <= 10) ageingCounts['6-10 Days']++;
      else ageingCounts['>10 Days']++;
    });

    const perfArray = Object.values(engMap).sort((a, b) => b.completed - a.completed);
    const salesArray = Object.values(salesMap).sort((a, b) => b.count - a.count);
    
    const topEngineer = perfArray.length > 0 ? perfArray[0].name : '-';

    const formattedClientSummary = filteredLeads
      .map(c => ({ ...c, displayValue: formatMoney(c.offerPrice) }))
      .sort((a, b) => b.daysOpen - a.daysOpen);

    const ageingArray = [
      { range: '0–2 Days', count: ageingCounts['0-2 Days'] },
      { range: '3–5 Days', count: ageingCounts['3-5 Days'] },
      { range: '6–10 Days', count: ageingCounts['6-10 Days'] },
      { range: '>10 Days', count: ageingCounts['>10 Days'] },
    ];

    const numMonths = Object.keys(monthMap).length || 1;
    const avgCostingPerMonth = Math.round(completed / numMonths);

    return {
      kpiData: {
        totalAssigned,
        pending,
        topEngineer,
        avgCostingPerMonth,
        totalQuoteValue: formatMoney(totalQuoteValue)
      },
      engineerPerformance: perfArray,
      salesData: salesArray,
      clientSummary: formattedClientSummary,
      leadAgeing: ageingArray
    };
  }, [filteredLeads]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-white">Loading live data...</div>;
  }

  return (
    <div className="max-w-[1700px] mx-auto space-y-4 pb-4">
      
      {/* Header & Filters */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 glass-card p-3 md:p-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl md:text-2xl font-bold gradient-text">Costing Team Dashboard</h1>
            <button
              onClick={() => {
                setSelectedWeek(selectedWeek === 'LATEST' ? 'All' : 'LATEST');
                setSelectedMonth('All');
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-all duration-200 ${
                selectedWeek === 'LATEST'
                  ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-500/30'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-blue-500 hover:text-white'
              }`}
            >
              {selectedWeek === 'LATEST' ? '✓ Latest Week' : '⚡ Latest Week (Sun–Sun)'}
            </button>
          </div>
          <p className="text-slate-400 text-xs mt-0.5">
            Capacity & efficiency tracking
            {selectedWeek === 'LATEST' && weeks[0] && (
              <span className="text-blue-400 font-medium ml-1.5">
                • {weeks[0].label} ({filteredLeads.length} leads)
              </span>
            )}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center">
          {/* Week Filter (Sunday to Sunday) */}
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg py-1.5 px-2.5 flex items-center space-x-1.5">
            <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Week:</span>
            <select 
              value={selectedWeek} 
              onChange={e => {
                setSelectedWeek(e.target.value);
                if (e.target.value !== 'All') setSelectedMonth('All');
              }}
              className="bg-transparent text-white text-xs outline-none cursor-pointer"
            >
              <option value="All" className="bg-slate-900 text-white">All Weeks</option>
              {weeks.length > 0 && (
                <option value="LATEST" className="bg-slate-900 text-blue-400">⚡ Latest Week ({weeks[0].label})</option>
              )}
              {weeks.map(w => (
                <option key={w.key} value={w.key} className="bg-slate-900 text-white">{w.label}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg py-1.5 px-2.5 flex items-center space-x-1.5">
            <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Month:</span>
            <select 
              value={selectedMonth} 
              onChange={e => {
                setSelectedMonth(e.target.value);
                if (e.target.value !== 'All') setSelectedWeek('All');
              }}
              className="bg-transparent text-white text-xs outline-none cursor-pointer"
            >
              {months.map(m => <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>)}
            </select>
          </div>
          
          {/* Costing Engineer Filter */}
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg py-1.5 px-2.5 flex items-center space-x-1.5">
            <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Costing Eng:</span>
            <select 
              value={selectedEngineer} 
              onChange={e => setSelectedEngineer(e.target.value)}
              className="bg-transparent text-white text-xs outline-none cursor-pointer"
            >
              {engineers.map(e => <option key={e} value={e} className="bg-slate-900 text-white">{e}</option>)}
            </select>
          </div>

          {/* Sales Person Filter */}
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg py-1.5 px-2.5 flex items-center space-x-1.5">
            <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Sales:</span>
            <select 
              value={selectedSalesPerson} 
              onChange={e => setSelectedSalesPerson(e.target.value)}
              className="bg-transparent text-white text-xs outline-none cursor-pointer"
            >
              {salesPersons.map(s => <option key={s} value={s} className="bg-slate-900 text-white">{s}</option>)}
            </select>
          </div>

          {/* Reset Filters button */}
          {(selectedWeek !== 'All' || selectedMonth !== 'All' || selectedEngineer !== 'All' || selectedSalesPerson !== 'All') && (
            <button
              onClick={() => {
                setSelectedWeek('All');
                setSelectedMonth('All');
                setSelectedEngineer('All');
                setSelectedSalesPerson('All');
              }}
              className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 transition-colors"
            >
              Reset ✕
            </button>
          )}
        </div>
      </header>

      {/* --- TOP ROW: KPI Summary --- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <KpiCard title="Assigned" value={kpiData.totalAssigned} icon={FileText} colorClass="bg-blue-500" />
        <KpiCard title="Pending" value={kpiData.pending} icon={Clock} colorClass="bg-amber-500" />
        <KpiCard title="Top Performer" value={kpiData.topEngineer} icon={UserCheck} colorClass="bg-emerald-500" />
        <KpiCard title="Avg Costing/Mo" value={kpiData.avgCostingPerMonth} icon={TrendingUp} colorClass="bg-purple-500" />
        <KpiCard title="Total Quote" value={kpiData.totalQuoteValue} icon={IndianRupee} colorClass="bg-pink-500" />
      </div>

      {/* --- MIDDLE ROW: Performance + Lead Status Graph + Total Value Graph --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Costing Person Status Table */}
        <div className="glass-card flex flex-col p-4 h-[350px]">
          <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-700/50">
            <h3 className="text-sm font-semibold text-white tracking-wide">Costing Person Status</h3>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
              {engineerPerformance.length} Persons
            </span>
          </div>
          
          <div className="flex-1 overflow-auto rounded-lg border border-slate-700/40">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[11px] uppercase bg-slate-900 text-slate-400 sticky top-0 z-10 border-b border-slate-700/80 shadow-sm">
                <tr>
                  <th className="px-3 py-2 bg-slate-900 font-semibold">Costing Person</th>
                  <th className="px-2 py-2 bg-slate-900 font-semibold text-center">Assigned</th>
                  <th className="px-2 py-2 bg-slate-900 font-semibold text-center">Comp</th>
                  <th className="px-2 py-2 bg-slate-900 font-semibold text-center">Pend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {engineerPerformance.map((eng, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-white">{eng.name}</td>
                    <td className="px-2 py-1.5 text-center font-mono">{eng.assigned}</td>
                    <td className="px-2 py-1.5 text-center font-mono font-medium text-emerald-400">{eng.completed}</td>
                    <td className="px-2 py-1.5 text-center font-mono font-medium text-amber-400">{eng.pending}</td>
                  </tr>
                ))}
                {engineerPerformance.length === 0 && (
                  <tr><td colSpan="4" className="text-center py-6 text-slate-500">No data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lead Status Graph (Stacked) */}
        <div className="glass-card flex flex-col p-4 h-[350px]">
          <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-700/50">
            <h3 className="text-sm font-semibold text-white tracking-wide">Costing Status</h3>
            <span className="text-[11px] text-slate-400">Completed vs Pending</span>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engineerPerformance} margin={{ top: 10, right: 15, left: -25, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={50} interval={0} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px', bottom: -5 }} />
                <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" radius={[0, 0, 3, 3]} />
                <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Total Costing per Lead Person Graph */}
        <div className="glass-card flex flex-col p-4 h-[350px]">
          <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-700/50">
            <h3 className="text-sm font-semibold text-white tracking-wide">Costing per Lead Person</h3>
            <span className="text-[11px] text-slate-400">Total Enquiries</span>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData} margin={{ top: 10, right: 15, left: -25, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} angle={-35} textAnchor="end" height={50} interval={0} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', fontSize: '12px' }} 
                />
                <Bar dataKey="count" fill="#3b82f6" name="Total Costings" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* --- BOTTOM ROW: Client Summary Table --- */}
      <div className="glass-card flex flex-col p-4">
        <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-white tracking-wide">Client Summary (Live Tracking)</h3>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
            {clientSummary.length} Leads
          </span>
        </div>
        
        <div className="max-h-[250px] overflow-auto rounded-lg border border-slate-700/40">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase bg-slate-900 text-slate-400 sticky top-0 z-10 border-b border-slate-700/80 shadow-sm">
              <tr>
                <th className="px-3 py-2 bg-slate-900 font-semibold">Client</th>
                <th className="px-3 py-2 bg-slate-900 font-semibold">Value</th>
                <th className="px-3 py-2 bg-slate-900 font-semibold">Costing Eng</th>
                <th className="px-3 py-2 bg-slate-900 font-semibold">Lead Person</th>
                <th className="px-3 py-2 bg-slate-900 font-semibold">Costing Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {clientSummary.map((client) => {
                const isPending = client.costingStatus === 'pending' || client.costingStatus === 'revision_in_progress';
                return (
                  <tr key={client.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-white">{client.client}</td>
                    <td className="px-3 py-1.5 text-blue-400 font-medium font-mono">{client.displayValue}</td>
                    <td className="px-3 py-1.5 text-slate-200">{client.engineer}</td>
                    <td className="px-3 py-1.5 text-slate-300">{client.salesPerson}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        !isPending ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {!isPending ? 'Completed' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {clientSummary.length === 0 && (
                <tr><td colSpan="5" className="text-center py-6 text-slate-500">No leads match filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
