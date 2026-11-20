import React from 'react';
import { useParams } from 'react-router-dom';
import StatementView from '../components/statement/StatementView';

const CustomerStatement: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <StatementView key={id} kind="client" id={Number(id)} />;
};

export default CustomerStatement;
