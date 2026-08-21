import React from 'react';
import LabelCard from './LabelCard';

export default function LabelSheet({ labels, onSelectProduct, onEditLabel, onDeleteLabel, gridCols = 2 }) {
  return (
    <div id="printable-label-sheet">
      <div className={`label-sheet-grid label-sheet-grid--${gridCols === 2 ? '2col' : '1col'}`}>
        {labels.map((label) => (
          <LabelCard
            key={label.id}
            label={label}
            onSelectProduct={onSelectProduct}
            onEditLabel={onEditLabel}
            onDeleteLabel={onDeleteLabel}
          />
        ))}
      </div>
    </div>
  );
}
