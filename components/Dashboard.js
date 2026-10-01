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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
    const monthOrder = ["April 2026", "May 2026", "June 2026", "July 2026", "August 2026", "September 2026", "October 2026"];
    const mSet = new Set();
    leads.forEach(l => {
      if (l.monthYear) mSet.add(l.monthYear);
      if (Array.isArray(l.months)) l.months.forEach(m => mSet.add(m));
    });
    const sorted = Array.from(mSet).sort((a, b) => {
      const idxA = monthOrder.indexOf(a);
      const idxB = monthOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.localeCompare(b);
    });
    return ['All', ...sorted];
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
      const isPending = l.costingStatus === 'pending' || l.costingStatus === 'revision_in_progress' || !l.costingStatus;

      let matchWeek = true;
      let matchMonth = true;
      if (selectedWeek === 'LATEST') {
        // RULE: For selected week, retain ALL pending costings till date regardless of week
        matchWeek = isPending || (l.weekKey === latestWeekKey) || (Array.isArray(l.weeks) && l.weeks.includes(latestWeekKey));
        matchMonth = selectedMonth === 'All' || isPending || (l.monthYear === selectedMonth) || (Array.isArray(l.months) && l.months.includes(selectedMonth));
      } else if (selectedWeek !== 'All') {
        // RULE: For any specific week, retain ALL pending costings till date regardless of week
        matchWeek = isPending || (l.weekKey === selectedWeek) || (Array.isArray(l.weeks) && l.weeks.includes(selectedWeek));
        matchMonth = selectedMonth === 'All' || isPending || (l.monthYear === selectedMonth) || (Array.isArray(l.months) && l.months.includes(selectedMonth));
      } else {
        matchMonth = selectedMonth === 'All' || (isPending && (selectedMonth === 'September 2026' || selectedMonth === 'October 2026')) || (l.monthYear === selectedMonth) || (Array.isArray(l.months) && l.months.includes(selectedMonth));
      }

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
      .sort((a, b) => {
        const isPendingA = a.costingStatus === 'pending' || a.costingStatus === 'revision_in_progress' || !a.costingStatus;
        const isPendingB = b.costingStatus === 'pending' || b.costingStatus === 'revision_in_progress' || !b.costingStatus;
        if (isPendingA && !isPendingB) return -1;
        if (!isPendingA && isPendingB) return 1;
        return (b.daysOpen || 0) - (a.daysOpen || 0);
      });

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

  const handleDownloadPdf = async () => {
    // 1. If a specific month is selected
    if (selectedMonth !== 'All' && selectedWeek === 'All' && selectedEngineer === 'All' && selectedSalesPerson === 'All') {
      const slug = selectedMonth.toLowerCase().replace(/\s+/g, '_');
      const filename = `Costing_Report_${selectedMonth.replace(/\s+/g, '_')}.pdf`;
      const link = document.createElement('a');
      link.href = `/reports/costing_report_${slug}.pdf`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 2. If Latest Week is selected
    if (selectedWeek === 'LATEST' && selectedMonth === 'All' && selectedEngineer === 'All' && selectedSalesPerson === 'All') {
      const link = document.createElement('a');
      link.href = `/reports/costing_report_latest_week.pdf`;
      link.download = `Costing_Report_Latest_Week.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 3. If All Records (no filter)
    if (selectedWeek === 'All' && selectedMonth === 'All' && selectedEngineer === 'All' && selectedSalesPerson === 'All') {
      const link = document.createElement('a');
      link.href = `/costing_report.pdf`;
      link.download = `Costing_Report_All.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 4. Custom filter combination -> open print-to-PDF window with 100% exact HTML & CSS layout
    const { openExactHtmlPrintReport } = await import('../utils/printExactHtmlReport');
    openExactHtmlPrintReport(filteredLeads, {
      month: selectedMonth,
      week: selectedWeek,
      engineer: selectedEngineer,
      salesPerson: selectedSalesPerson,
      weekLabel: selectedWeek !== 'All' ? (weeks.find(w => w.key === selectedWeek)?.label || selectedWeek) : ''
    });
  };

  const getPendingDurationInfo = (lead) => {
    const isPending = lead.costingStatus === 'pending' || lead.costingStatus === 'revision_in_progress' || !lead.costingStatus;
    if (!isPending) return null;

    const days = lead.daysOpen !== undefined ? lead.daysOpen : 0;
    const weeks = Math.floor(days / 7);

    let durationLabel = '';
    let severityClass = '';

    if (days <= 0) {
      durationLabel = 'Today';
      severityClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    } else if (days < 7) {
      durationLabel = `${days}d`;
      severityClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    } else {
      const wkText = weeks === 1 ? '1 wk' : `${weeks} wks`;
      const rem = days % 7;
      const remText = rem > 0 ? ` ${rem}d` : '';
      durationLabel = `${wkText}${remText}`;
      if (weeks < 2) {
        severityClass = 'bg-amber-500/25 text-amber-300 border-amber-500/50';
      } else if (weeks < 4) {
        severityClass = 'bg-orange-500/30 text-orange-300 border-orange-500/60 font-semibold';
      } else {
        severityClass = 'bg-rose-500/35 text-rose-200 border-rose-500/70 font-bold';
      }
    }

    return {
      days,
      weeks,
      label: durationLabel,
      fullText: weeks > 0 ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'} (${days} days)` : `${days} days`,
      severityClass
    };
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-white">Loading live data...</div>;
  }

  return (
    <div className="h-full flex flex-col gap-2.5 max-w-[1750px] mx-auto select-none">
      
      {/* Header, KPIs & Filters Bar */}
      <header className="glass-card flex flex-wrap lg:flex-nowrap items-center justify-between p-2.5 px-3.5 gap-2.5 shrink-0">
        {/* Left: Title & Quick Latest Week */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <h1 className="text-base sm:text-lg font-bold gradient-text whitespace-nowrap">Costing Dashboard</h1>
          <button
            onClick={() => {
              setSelectedWeek(selectedWeek === 'LATEST' ? 'All' : 'LATEST');
              setSelectedMonth('All');
            }}
            className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border transition-all duration-200 ${
              selectedWeek === 'LATEST'
                ? 'bg-blue-600 border-blue-400 text-white shadow-sm shadow-blue-500/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-blue-500 hover:text-white'
            }`}
          >
            {selectedWeek === 'LATEST' ? '✓ Latest Week' : '⚡ Latest Week'}
          </button>
        </div>

        {/* Center: 5 Quick KPI Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-700/60 rounded-md px-2 py-0.5">
            <span className="text-[9px] uppercase font-bold text-slate-400">Assigned:</span>
            <span className="text-xs font-bold text-blue-400 font-mono">{kpiData.totalAssigned}</span>
          </div>
          <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-700/60 rounded-md px-2 py-0.5">
            <span className="text-[9px] uppercase font-bold text-slate-400">Pending:</span>
            <span className="text-xs font-bold text-amber-400 font-mono">{kpiData.pending}</span>
          </div>
          <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-700/60 rounded-md px-2 py-0.5">
            <span className="text-[9px] uppercase font-bold text-slate-400">Top:</span>
            <span className="text-xs font-bold text-emerald-400 truncate max-w-[100px]">{kpiData.topEngineer}</span>
          </div>
          <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-700/60 rounded-md px-2 py-0.5">
            <span className="text-[9px] uppercase font-bold text-slate-400">Avg/Mo:</span>
            <span className="text-xs font-bold text-purple-400 font-mono">{kpiData.avgCostingPerMonth}</span>
          </div>
          <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-700/60 rounded-md px-2 py-0.5">
            <span className="text-[9px] uppercase font-bold text-slate-400">Quote:</span>
            <span className="text-xs font-bold text-pink-400 font-mono">{kpiData.totalQuoteValue}</span>
          </div>
        </div>

        {/* Right: Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Week Filter (Sunday to Sunday) */}
          <div className="bg-slate-900/90 border border-slate-700/60 rounded-md py-1 px-2 flex items-center space-x-1">
            <span className="text-slate-400 text-[10px] font-semibold uppercase">Week:</span>
            <select 
              value={selectedWeek} 
              onChange={e => {
                setSelectedWeek(e.target.value);
                if (e.target.value !== 'All') setSelectedMonth('All');
              }}
              className="bg-transparent text-white text-[11px] outline-none cursor-pointer max-w-[140px]"
            >
              <option value="All" className="bg-slate-900 text-white">All Weeks</option>
              {weeks.length > 0 && (
                <option value="LATEST" className="bg-slate-900 text-blue-400">⚡ Latest ({weeks[0].label})</option>
              )}
              {weeks.map(w => (
                <option key={w.key} value={w.key} className="bg-slate-900 text-white">{w.label}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div className="bg-slate-900/90 border border-slate-700/60 rounded-md py-1 px-2 flex items-center space-x-1">
            <span className="text-slate-400 text-[10px] font-semibold uppercase">Mo:</span>
            <select 
              value={selectedMonth} 
              onChange={e => {
                setSelectedMonth(e.target.value);
                if (e.target.value !== 'All') setSelectedWeek('All');
              }}
              className="bg-transparent text-white text-[11px] outline-none cursor-pointer max-w-[95px]"
            >
              {months.map(m => <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>)}
            </select>
          </div>
          
          {/* Costing Engineer Filter */}
          <div className="bg-slate-900/90 border border-slate-700/60 rounded-md py-1 px-2 flex items-center space-x-1">
            <span className="text-slate-400 text-[10px] font-semibold uppercase">Eng:</span>
            <select 
              value={selectedEngineer} 
              onChange={e => setSelectedEngineer(e.target.value)}
              className="bg-transparent text-white text-[11px] outline-none cursor-pointer max-w-[100px]"
            >
              {engineers.map(e => <option key={e} value={e} className="bg-slate-900 text-white">{e}</option>)}
            </select>
          </div>

          {/* Sales Person Filter */}
          <div className="bg-slate-900/90 border border-slate-700/60 rounded-md py-1 px-2 flex items-center space-x-1">
            <span className="text-slate-400 text-[10px] font-semibold uppercase">Sales:</span>
            <select 
              value={selectedSalesPerson} 
              onChange={e => setSelectedSalesPerson(e.target.value)}
              className="bg-transparent text-white text-[11px] outline-none cursor-pointer max-w-[90px]"
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
              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold px-1.5 py-0.5 transition-colors"
            >
              Reset ✕
            </button>
          )}

          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            title={selectedMonth !== 'All' ? `Download ${selectedMonth} PDF Report` : selectedWeek !== 'All' ? 'Download Filtered Week PDF Report' : 'Download Complete PDF Report'}
            className="text-[11px] bg-rose-600 hover:bg-rose-500 text-white font-semibold px-2.5 py-1 rounded flex items-center gap-1 transition-colors shadow-sm ml-1 disabled:opacity-50 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {isGeneratingPdf ? 'Generating...' : 'PDF'}
          </button>
        </div>
      </header>

      {/* Main Single-Screen Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 flex-1 min-h-0">
        
        {/* Left Column (4 cols): Costing Person Status Table */}
        <div className="glass-card flex flex-col p-3 lg:col-span-4 h-full min-h-0">
          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-slate-700/50 shrink-0">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Costing Person Status</h3>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/90 px-2 py-0.5 rounded-full">
              {selectedWeek !== 'All' ? 'Wk Comp + All Pend' : `${engineerPerformance.length} Persons`}
            </span>
          </div>
          
          <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-slate-700/40">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-[10px] uppercase bg-slate-900 text-slate-400 sticky top-0 z-10 border-b border-slate-700/80 shadow-sm">
                <tr>
                  <th className="px-2.5 py-1.5 bg-slate-900 font-bold">Costing Person</th>
                  <th className="px-1.5 py-1.5 bg-slate-900 font-bold text-center">Assigned</th>
                  <th className="px-1.5 py-1.5 bg-slate-900 font-bold text-center">{selectedWeek !== 'All' ? 'Wk Comp' : 'Comp'}</th>
                  <th className="px-1.5 py-1.5 bg-slate-900 font-bold text-center" title="All open pending costings till date">{selectedWeek !== 'All' ? 'All Pend' : 'Pend'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {engineerPerformance.map((eng, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-2.5 py-1 font-medium text-white text-[11px] truncate max-w-[130px]">{eng.name}</td>
                    <td className="px-1.5 py-1 text-center font-mono text-[11px]">{eng.assigned}</td>
                    <td className="px-1.5 py-1 text-center font-mono text-[11px] font-semibold text-emerald-400">{eng.completed}</td>
                    <td className="px-1.5 py-1 text-center font-mono text-[11px] font-semibold text-amber-400">{eng.pending}</td>
                  </tr>
                ))}
                {engineerPerformance.length === 0 && (
                  <tr><td colSpan="4" className="text-center py-4 text-slate-500 text-xs">No data found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (8 cols): Top Charts + Bottom Live Tracking Table */}
        <div className="flex flex-col gap-2.5 lg:col-span-8 h-full min-h-0">
          
          {/* Top Half: 2 Charts Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 h-[48%] min-h-0">
            
            {/* Chart 1: Costing Status Stacked */}
            <div className="glass-card flex flex-col p-2.5 h-full min-h-0">
              <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-700/50 shrink-0">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Costing Status</h3>
                <span className="text-[10px] text-slate-400">Completed vs Pending</span>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={engineerPerformance} margin={{ top: 5, right: 10, left: -25, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={35} interval={0} />
                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                    <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', bottom: -5 }} />
                    <Bar dataKey="completed" stackId="a" fill="#10b981" name="Completed" radius={[0, 0, 2, 2]} />
                    <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Costing per Lead Person */}
            <div className="glass-card flex flex-col p-2.5 h-full min-h-0">
              <div className="flex justify-between items-center mb-1 pb-1 border-b border-slate-700/50 shrink-0">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Costing per Lead Person</h3>
                <span className="text-[10px] text-slate-400">Total Enquiries</span>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesData} margin={{ top: 5, right: 10, left: -25, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} angle={-30} textAnchor="end" height={35} interval={0} />
                    <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                    <RechartsTooltip 
                      cursor={{fill: 'rgba(255,255,255,0.05)'}} 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '6px', fontSize: '11px', padding: '4px 8px' }} 
                    />
                    <Bar dataKey="count" fill="#3b82f6" name="Total Costings" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Half: Client Summary (Live Tracking) Table */}
          <div className="glass-card flex flex-col p-2.5 h-[52%] min-h-0">
            <div className="flex justify-between items-center mb-1.5 pb-1 border-b border-slate-700/50 shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Client Summary (Live Tracking)</h3>
                {selectedWeek !== 'All' && (
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                    Week Output + All Open Pending
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800/90 px-2 py-0.5 rounded-full">
                {clientSummary.length} Leads
              </span>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-slate-700/40">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="text-[10px] uppercase bg-slate-900 text-slate-400 sticky top-0 z-10 border-b border-slate-700/80 shadow-sm">
                  <tr>
                    <th className="px-2.5 py-1.5 bg-slate-900 font-bold">Client & ID</th>
                    <th className="px-2 py-1.5 bg-slate-900 font-bold">Value</th>
                    <th className="px-2 py-1.5 bg-slate-900 font-bold">Costing Eng</th>
                    <th className="px-2 py-1.5 bg-slate-900 font-bold">Lead Person</th>
                    <th className="px-2 py-1.5 bg-slate-900 font-bold">Costing Status / Ageing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {clientSummary.map((client) => {
                    const isPending = client.costingStatus === 'pending' || client.costingStatus === 'revision_in_progress' || !client.costingStatus;
                    const durationInfo = getPendingDurationInfo(client);
                    const isCritical = isPending && durationInfo?.weeks >= 4;
                    return (
                      <tr key={client.id} className={`hover:bg-slate-800/40 transition-colors ${isCritical ? 'bg-rose-950/25' : ''}`}>
                        <td className="px-2.5 py-1.5 font-medium text-white text-[11px] max-w-[200px]" title={client.client}>
                          <div className="truncate font-semibold text-slate-100">{client.client}</div>
                          <div className="text-[9px] text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-300 font-bold">#{client.id}</span>
                            <span>&bull;</span>
                            <span>Enq: {client.enqDateRaw || (client.enqDate ? client.enqDate.substring(0, 10) : '-')}</span>
                            {client.offerSubmissionDate && client.offerSubmissionDate !== '-' && (
                              <>
                                <span>&bull;</span>
                                <span className="text-sky-300">Sub: {client.offerSubmissionDate}</span>
                              </>
                            )}
                            {client.currentStatus && (
                              <>
                                <span>&bull;</span>
                                <span className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase ${
                                  client.currentStatus === 'won' ? 'bg-emerald-500/20 text-emerald-400' :
                                  client.currentStatus === 'lost' ? 'bg-rose-500/20 text-rose-400' :
                                  client.currentStatus === 'quoted' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {client.currentStatus}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-blue-400 font-medium font-mono text-[11px] whitespace-nowrap">{client.displayValue}</td>
                        <td className="px-2 py-1.5 text-slate-200 text-[11px] truncate max-w-[120px] font-medium">{client.engineer}</td>
                        <td className="px-2 py-1.5 text-slate-300 text-[11px] truncate max-w-[120px]">{client.salesPerson}</td>
                        <td className="px-2 py-1.5">
                          {!isPending ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Completed
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap border ${durationInfo?.severityClass}`} title={durationInfo?.fullText}>
                                ⏳ Pending: {durationInfo?.label}
                              </span>
                              {durationInfo?.weeks >= 2 && (
                                <span className="text-[9px] text-rose-400 font-semibold leading-tight">
                                  {durationInfo.weeks} wks open
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {clientSummary.length === 0 && (
                    <tr><td colSpan="5" className="text-center py-4 text-slate-500 text-xs">No leads match filters</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
