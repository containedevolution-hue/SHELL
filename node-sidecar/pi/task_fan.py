# task_fan.py — temperature-mode fan control for the FREENOVE case kit.
# REPLACES Freenove's shipped Code/task_fan.py, which was their factory test
# left in the box: a forever loop ramping duty 0->255->0 (the audible rev
# cycling). Mode 1 + thresholds hands the curve to the case controller
# (I2C 0x21); after setup this task just idles and cleans up on exit.
# Install: cp this file over Freenove_Computer_Case_Kit_for_Raspberry_Pi/Code/task_fan.py
# (run by task_manager.py via the freenove-case systemd service).
from api_expansion import Expansion
import atexit
import signal
import time
import sys

class FAN_TASK:

    def __init__(self):
        self.expansion = None
        self.board_type = None
        self.running = True

        try:
            self.expansion = Expansion()
            self.board_type = self.expansion.get_board_type()
        except Exception:
            sys.exit(1)

        atexit.register(self.handle_signal)
        signal.signal(signal.SIGTERM, self.handle_signal)
        signal.signal(signal.SIGINT, self.handle_signal)

    def handle_signal(self, signum=None, frame=None):
        try:
            if self.expansion:
                self.expansion.set_fan_mode(0)
        except Exception as e:
            print(e)
        try:
            if self.expansion:
                if self.board_type == "FNK0100":
                    self.expansion.set_fan_duty(0, 0)
                elif self.board_type == "FNK0107":
                    self.expansion.set_fan_duty(0, 0, 0)
        except Exception as e:
            print(e)
        try:
            if self.expansion:
                self.expansion.end()
        except Exception as e:
            print(e)
        self.running = False

    def run_fan_loop(self):
        # Temperature mode: the controller ramps the fans itself between the
        # low/high thresholds. No manual duty writes after this.
        self.expansion.set_fan_mode(1)
        self.expansion.set_fan_frequency(50000)
        if self.board_type == "FNK0100":
            self.expansion.set_fan_temp_mode_threshold(50, 100)
        elif self.board_type == "FNK0107":
            self.expansion.set_fan_temp_mode_threshold(50, 100, 3)
            self.expansion.set_fan_temp_mode_speed(75, 125, 175)
            self.expansion.set_fan_pi_following(0, 100)
            self.expansion.set_fan_power_switch(1)

        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

if __name__ == "__main__":
    try:
        FAN_TASK().run_fan_loop()
    except KeyboardInterrupt:
        print("\nShutdown requested by user (Ctrl+C)")
    except Exception as e:
        print(f"Unexpected error: {e}")
