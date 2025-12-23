# Motia Shim Library for BioViz
# This acts as a local implementation of the Motia framework to facilitate
# "Code-First" workflow development in the Python Sidecar.

import functools
import logging
import inspect
import json
import time
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field

# Configure logging
logging.basicConfig(level=logging.INFO, format='[Motia] %(message)s')
logger = logging.getLogger("Motia")

@dataclass
class StepMetadata:
    name: str
    description: str
    func_name: str
    inputs: List[str]
    outputs: List[str]

class WorkflowContext:
    """Holds the state for a workflow execution."""
    def __init__(self):
        self._state: Dict[str, Any] = {}
        self._history: List[Dict[str, Any]] = []

    def set(self, key: str, value: Any):
        self._state[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._state.get(key, default)

    def log_step(self, step_name: str, status: str, result: Any = None, duration: float = 0.0):
        entry = {
            "step": step_name,
            "status": status,
            "timestamp": time.time(),
            "duration": duration
        }
        if result and not isinstance(result, (bytes, bytearray)):
             # Don't log heavy binary data
            try:
                json.dumps(result) # Check if serializable
                entry["result"] = result
            except:
                entry["result"] = str(result)
        
        self._history.append(entry)
        # In a real engine, this would emit an event to the frontend
        print(f"JSON_EVENT::{json.dumps({'type': 'WORKFLOW_UPDATE', 'payload': entry})}")

    def get_history(self) -> List[Dict[str, Any]]:
        return self._history

REGISTRY: Dict[str, StepMetadata] = {}

def step(name: str = None, description: str = ""):
    """Decorator to mark a function as a Motia Workflow Step."""
    def decorator(func: Callable):
        nonlocal name
        if name is None:
            name = func.__name__
        
        # Introspect function signature
        sig = inspect.signature(func)
        inputs = list(sig.parameters.keys())
        
        # Register metadata
        REGISTRY[name] = StepMetadata(
            name=name,
            description=description,
            func_name=func.__name__,
            inputs=inputs,
            outputs=["result"] # Simplified
        )

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # If the first arg is context, pass it, else inject dependencies?
            # For this MVP, we assume manual invocation or simple injection
            start_time = time.time()
            ctx = kwargs.get('context', None)
            
            if ctx:
                ctx.log_step(name, "RUNNING")
            
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                if ctx:
                    ctx.log_step(name, "COMPLETED", result, duration)
                return result
            except Exception as e:
                duration = time.time() - start_time
                logger.error(f"Step {name} failed: {e}")
                if ctx:
                    ctx.log_step(name, "FAILED", {"error": str(e)}, duration)
                raise e

        wrapper._is_step = True
        wrapper._step_name = name
        return wrapper
    return decorator

class WorkflowEngine:
    def __init__(self):
        self.context = WorkflowContext()

    def run_sequence(self, steps: List[Callable], initial_state: Dict[str, Any] = None):
        """Runs a list of step functions in sequence."""
        if initial_state:
            for k, v in initial_state.items():
                self.context.set(k, v)
        
        results = {}
        for step_func in steps:
            if not getattr(step_func, '_is_step', False):
                logger.warning(f"{step_func.__name__} is not a decorated step.")
            
            # Simple dependency injection: 
            # If step needs arg 'data', looks in context
            sig = inspect.signature(step_func)
            kwargs = {'context': self.context}
            
            # This is a very naive dependency injection for MVP
            # In a real agent, the Planner would map this
            
            try:
                result = step_func(**kwargs)
                # Store result in context? specific steps might handle this
            except Exception as e:
                logger.error(f"Workflow aborted at step: {e}")
                break
                
        return self.context
