import './layout.css';
import { useContext, useEffect } from 'react';
import { DataContext, DataDispatchContext, dataReducer } from '../context/DataContext.jsx';
import Viewport from '../viewport/viewport.jsx';

export default function Layout() {
    const { ld, renderingEngine } = useContext(DataContext).data;
    const { r, c } = ld;

    const { dispatch } = useContext(DataDispatchContext);

    useEffect(() => {
        console.log("layout rerendering")
        const handleResize = () => {
            renderingEngine.resize(true);
        };

        if (renderingEngine) window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    
    }, [renderingEngine]);

    const items = Array.from({ length: r * c }).map((_, idx) => (
        <div key={idx} className="grid-item">
            <Viewport viewport_idx={idx} rendering_engine={renderingEngine} />
        </div>
    ));

    return renderingEngine ? (
        <div className="grid-container" style={{ gridTemplateColumns: `repeat(${c}, 1fr)`, gridTemplateRows: `repeat(${r}, 1fr)` }}>{items}</div>
    ) : null;
};