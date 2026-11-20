import React from 'react';
import { useParams } from 'react-router-dom';
import StatementView from '../components/statement/StatementView';

/**
 * Supplier ledger: credit (له) raises what the shop owes the supplier,
 * debit (عليه) lowers it. The balance is what the shop owes.
 */
const SupplierStatement: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <StatementView key={id} kind="supplier" id={Number(id)} />;
};

export default SupplierStatement;
