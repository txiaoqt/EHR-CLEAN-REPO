import React from 'react';

const KpiCard = ({ title, value, description, Icon, className = '', valueClassName = '' }) => (
  <div className={`kpi-card${className ? ` ${className}` : ''}`}>
    <div className="kpi-card-heading">
      <div className="kpi-title">{title}</div>
      {Icon && (
        <span className="kpi-card-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
      )}
    </div>
    <div className={`kpi-value${valueClassName ? ` ${valueClassName}` : ''}`}>{value}</div>
    <div className="kpi-subtitle">{description}</div>
  </div>
);

export default KpiCard;
