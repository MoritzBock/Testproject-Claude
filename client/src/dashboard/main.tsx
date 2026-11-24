import { render } from 'preact';
import { DashApp } from './App';
import './dashboard.css';

render(<DashApp />, document.getElementById('dash-root')!);
