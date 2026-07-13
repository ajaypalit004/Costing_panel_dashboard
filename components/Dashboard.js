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
  <div className="glass-card flex items-center justify-between p-5 hover:scale-105 transition-transform duration-300">
    <div>
      <p className="text-slate-400 text-sm font-medium mb-1 uppercase tracking-wider">{title}</p>
      <h3 className="text-2xl font-bold text-white">{value}</h3>
    </div>
    <div className={`p-3 rounded-full ${colorClass} bg-opacity-20`}>
      <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
    </div>
  </div>
);

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
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
    return leads.filter(l => {
      const matchMonth = selectedMonth === 'All' || l.monthYear === selectedMonth;
      const matchEng = selectedEngineer === 'All' || l.engineer === selectedEngineer;
      const matchSales = selectedSalesPerson === 'All' || l.salesPerson === selectedSalesPerson;
      return matchMonth && matchEng && matchSales;
    });
  }, [leads, selectedMonth, selectedEngineer, selectedSalesPerson]);

  // Compute KPIs & Charts dynamically based on new rules
  const { kpiData, engineerPerformance, salesData, clientSummary, leadAgeing } = useMemo(() => {
    
    let totalAssigned = 0;
    let pending = 0;
    let completed = 0;
    let totalQuoteValue = 0;

    const engMap = {};
    const salesMap = {};
    const ageingCounts = { '0-2 Days': 0, '3-5 Days': 0, '6-10 Days': 0, '>10 Days': 0 };

    filteredLeads.forEach(lead => {
      totalAssigned += 1;
      totalQuoteValue += lead.offerPrice;

      // RULE: Costing is ONLY pending for these cases
      const isPending = lead.costingStatus === 'pending' || lead.costingStatus === 'revision_in_progress';
      // RULE: For all other cases treat costing is done
      const isCompleted = !isPending;

      if (isPending) pending += 1;
      if (isCompleted) completed += 1;

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
      .sort((a, b) => b.daysOpen - a.daysOpen)
      .slice(0, 10);

    const ageingArray = [
      { range: '0–2 Days', count: ageingCounts['0-2 Days'] },
      { range: '3–5 Days', count: ageingCounts['3-5 Days'] },
      { range: '6–10 Days', count: ageingCounts['6-10 Days'] },
      { range: '>10 Days', count: ageingCounts['>10 Days'] },
    ];

    return {
      kpiData: {
        totalAssigned,
        pending,
        topEngineer,
        avgTat: '2.4 Days', // Mocked as Excel lacks timestamps for completion
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
    <div className="max-w-[1600px] mx-auto space-y-8 pb-10">
      
      {/* Header & Filters */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold gradient-text mb-2">Costing Team Dashboard</h1>
          <p className="text-slate-400">Interactive capacity and efficiency tracking.</p>
        </div>
        
        <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4">
          <div className="glass-card py-2 px-4 flex items-center space-x-2">
            <span className="text-slate-400 text-sm">Month:</span>
            <select 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-slate-800 text-white text-sm rounded border border-slate-600 px-2 py-1 outline-none focus:border-blue-500"
            >
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          
          <div className="glass-card py-2 px-4 flex items-center space-x-2">
            <span className="text-slate-400 text-sm">Costing Engineer:</span>
            <select 
              value={selectedEngineer} 
              onChange={e => setSelectedEngineer(e.target.value)}
              className="bg-slate-800 text-white text-sm rounded border border-slate-600 px-2 py-1 outline-none focus:border-blue-500"
            >
              {engineers.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div className="glass-card py-2 px-4 flex items-center space-x-2">
            <span className="text-slate-400 text-sm">Sales Person:</span>
            <select 
              value={selectedSalesPerson} 
              onChange={e => setSelectedSalesPerson(e.target.value)}
              className="bg-slate-800 text-white text-sm rounded border border-slate-600 px-2 py-1 outline-none focus:border-blue-500"
            >
              {salesPersons.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* --- TOP ROW: KPI Summary --- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard title="Assigned" value={kpiData.totalAssigned} icon={FileText} colorClass="bg-blue-500" />
        <KpiCard title="Pending" value={kpiData.pending} icon={Clock} colorClass="bg-amber-500" />
        <KpiCard title="Top Performer" value={kpiData.topEngineer} icon={UserCheck} colorClass="bg-emerald-500" />
        <KpiCard title="Avg TAT" value={kpiData.avgTat} icon={TrendingUp} colorClass="bg-purple-500" />
        <KpiCard title="Total Quote" value={kpiData.totalQuoteValue} icon={IndianRupee} colorClass="bg-pink-500" />
      </div>

      {/* --- MIDDLE ROW: Performance + Lead Status Graph + Total Value Graph --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Engineer Performance Table */}
        <div className="glass-card lg:col-span-1 overflow-auto h-[400px]">
          <h3 className="text-lg font-semibold text-white mb-4">Costing Person Status</h3>
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="text-xs uppercase bg-slate-800/50 text-slate-400 sticky top-0">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Costing Person</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Comp</th>
                <th className="px-4 py-3">Pend</th>
              </tr>
            </thead>
            <tbody>
              {engineerPerformance.map((eng, idx) => (
                <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-medium text-white">{eng.name}</td>
                  <td className="px-4 py-3">{eng.assigned}</td>
                  <td className="px-4 py-3 text-emerald-400">{eng.completed}</td>
                  <td className="px-4 py-3 text-amber-400">{eng.pending}</td>
                </tr>
              ))}
              {engineerPerformance.length === 0 && <tr><td colSpan="4" className="text-center py-6 text-slate-500">No data found</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Lead Status Graph (Stacked) */}
        <div className="glass-card lg:col-span-1 h-[400px]">
           <h3 className="text-lg font-semibold text-white mb-4">Costing Status</h3>
           <div className="h-72">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engineerPerformance} margin={{ top: 20, right: 30, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={90} interval={0} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px', bottom: 0 }} />
                  <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" radius={[4, 4, 0, 0]} />
                </BarChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Total Value Graph (New requirement) */}
        <div className="glass-card lg:col-span-1 h-[400px]">
           <h3 className="text-lg font-semibold text-white mb-4">Costing per Lead Person</h3>
           <div className="h-72">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesData} margin={{ top: 20, right: 30, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} angle={-45} textAnchor="end" height={90} interval={0} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }} 
                  />
                  <Bar dataKey="count" fill="#3b82f6" name="Total Costings" radius={[4, 4, 0, 0]} />
                </BarChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* --- BOTTOM ROW: Ageing + Client Table --- */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Lead Type */}
        <div className="lg:col-span-1 space-y-6">
          
          <div className="glass-card">
            <h3 className="text-lg font-semibold text-white mb-2">Lead Type Breakdown</h3>
            <div className="h-40 flex justify-center items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leadTypeData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value" stroke="none">
                    {leadTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Client Summary Table */}
        <div className="glass-card lg:col-span-3 overflow-auto">
          <h3 className="text-lg font-semibold text-white mb-4">Client Summary (Live Tracking)</h3>
          <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap">
            <thead className="text-xs uppercase bg-slate-800/50 text-slate-400 sticky top-0">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Client</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Costing Eng</th>
                <th className="px-4 py-3">Costing Status</th>
                <th className="px-4 py-3 rounded-tr-lg">Age (Days)</th>
              </tr>
            </thead>
            <tbody>
              {clientSummary.map((client) => {
                const isPending = client.costingStatus === 'pending' || client.costingStatus === 'revision_in_progress';
                return (
                  <tr key={client.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-white">{client.client}</td>
                    <td className="px-4 py-3 text-blue-400 font-medium">{client.displayValue}</td>
                    <td className="px-4 py-3 text-white">{client.engineer}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        !isPending ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {!isPending ? 'Completed' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={client.daysOpen > 10 ? 'text-rose-400 font-bold' : ''}>
                        {client.daysOpen} d
                      </span>
                    </td>
                  </tr>
                );
              })}
              {clientSummary.length === 0 && <tr><td colSpan="5" className="text-center py-6 text-slate-500">No leads match filters</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
