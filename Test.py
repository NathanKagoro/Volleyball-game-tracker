import tkinter as tk
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.lines as mlines 

# Initialize the main window with a larger size
root = tk.Tk()
root.title("Score Tracker with Cause & Player Selection")
root.geometry("1000x700")  # Set a larger window size
root.withdraw()  # Hide the main window initially until player numbers are entered

# Initialize history lists and counters as lists
score_history = [0]  # Net score (wins - losses)
cause_history = []   # Stores cause and player labels
player_history = []  # Empty list to store player history

win_count = [0]      # List to track wins over time
loss_count = [0]     # List to track losses over time
streak_history = [0] # List to track streaks, starting at 0

window_size = 30     # X-axis starts showing at 30 events
y_min, y_max = -10, 10  # Base Y-axis limits

# Player numbers (to be set by the user)
us_players = []
opponent_players = []

# Global canvas variable to be accessed across functions
canvas = None

# --- Functions for player input ---
def get_player_numbers():
    # Prompt user to input player numbers
    def submit_players():
        global us_players, opponent_players
        us_players = us_entry.get().split(',')
        opponent_players = opponent_entry.get().split(',')
        player_input_window.destroy()

        # Show the main window now that the player numbers are set
        root.deiconify()

        # Enable the rest of the game UI after player numbers are entered
        create_game_ui()

    # Create a window to input player numbers
    player_input_window = tk.Toplevel(root)
    player_input_window.title("Enter Player Numbers")
    
    # Labels and inputs for player numbers
    tk.Label(player_input_window, text="Enter Us player numbers (comma separated):", font=("Arial", 12)).pack(pady=10)
    us_entry = tk.Entry(player_input_window, font=("Arial", 12), width=30)
    us_entry.pack(pady=5)
    
    tk.Label(player_input_window, text="Enter Opponent player numbers (comma separated):", font=("Arial", 12)).pack(pady=10)
    opponent_entry = tk.Entry(player_input_window, font=("Arial", 12), width=30)
    opponent_entry.pack(pady=5)
    
    submit_button = tk.Button(player_input_window, text="Submit", font=("Arial", 12), command=submit_players)
    submit_button.pack(pady=20)

# --- Game UI Elements ---
def create_game_ui():
    global win_label, loss_label, streak_label, canvas  # Reference global canvas variable

    # Set up the main game interface after player numbers are provided
    win_label = tk.Label(root, text=f"Us: {win_count[-1]}", font=("Arial", 18))
    win_label.pack(pady=10)

    loss_label = tk.Label(root, text=f"Opponent: {loss_count[-1]}", font=("Arial", 18))
    loss_label.pack(pady=10)

    streak_label = tk.Label(root, text=f"Streak: {streak_history[-1]}", font=("Arial", 18))
    streak_label.pack(pady=10)

    win_button = tk.Button(root, text="Us", font=("Arial", 14), width=15,
                           command=lambda: update_score(1, "Win", win_button))
    win_button.pack(pady=10)

    loss_button = tk.Button(root, text="Opponent", font=("Arial", 14), width=15,
                            command=lambda: update_score(-1, "Loss", loss_button))
    loss_button.pack(pady=10)

    # Set up the Matplotlib figure
    fig, ax = plt.subplots(figsize=(9, 5))
    global canvas  # Reference canvas as global
    canvas = FigureCanvasTkAgg(fig, master=root)
    canvas.get_tk_widget().pack(expand=True, fill="both")

    update_plot()  # Initial plot

# --- Functions for score updating and popups ---
def update_score(change, result_type, button):
    # Create the cause selection popup close to the button
    cause_popup(change, result_type, button)

def cause_popup(change, result_type, button):
    # Create a new popup for the cause
    popup = tk.Toplevel(root)
    popup.title("Select Cause")
    
    # Store the position of the cause popup before it gets destroyed
    x_pos = button.winfo_rootx() + 20
    y_pos = button.winfo_rooty() + 50
    popup.geometry(f"700x700+{x_pos}+{y_pos}")  # Increased size for the cause popup

    label = tk.Label(popup, text="What caused this?", font=("Arial", 14))
    label.pack(pady=10)

    # Cause buttons
    causes = ["Ace", "Block", "Communication", "Passing Error", "Serving Error", "Kill", "Hitting Error", "Tip", "Free Ball", "Court Coverage", "In/Out Ball"]
    for cause in causes:
        tk.Button(popup, text=cause, font=("Arial", 12), width=25,
                  command=lambda c=cause: finalize_score(change, c, popup, x_pos, y_pos)).pack(pady=10)

def finalize_score(change, cause, popup, x_pos, y_pos):
    popup.destroy()

    # Create a new popup to select the player
    player_popup = tk.Toplevel(root)
    player_popup.title("Select Player")

    # Position player popup based on stored position from cause popup
    player_popup.geometry(f"500x500+{x_pos}+{y_pos}")  # Set a larger size for the player popup

    label = tk.Label(player_popup, text="Select Player", font=("Arial", 14))
    label.pack(pady=10)

    # Determine valid player options based on win or loss
    if change == 1:
        players = us_players
    else:
        players = opponent_players

    for player in players:
        tk.Button(player_popup, text=f"Player {player}", font=("Arial", 14),
                  command=lambda p=player: record_score(change, cause, p, player_popup)).pack(pady=10)

def record_score(change, cause, player, popup):
    popup.destroy()  # Close the player selection window

    # Update score_history
    score_history.append(score_history[-1] + change)
    # Record the cause and player label (e.g., "Ace - 2")
    cause_history.append(f"{cause} - {player}")
    player_history.append(player)  # Record player

    # Update win and loss counts
    if change == 1:
        win_count.append(win_count[-1] + 1)
        loss_count.append(loss_count[-1])
    else:
        loss_count.append(loss_count[-1] + 1)
        win_count.append(win_count[-1])

    # Update streak: if same type as last event, increment; otherwise, reset to 1 (for win) or -1 (for loss)
    if (change > 0 and streak_history[-1] > 0) or (change < 0 and streak_history[-1] < 0):
        streak_history.append(streak_history[-1] + change)
    else:
        # Reset streak: start at 1 for a win, -1 for a loss.
        streak_history.append(1 if change > 0 else -1)

    # Update UI labels
    win_label.config(text=f"Us: {win_count[-1]}")
    loss_label.config(text=f"Opponent: {loss_count[-1]}")
    streak_label.config(text=f"Streak: {streak_history[-1]}")

    check_game_end()

    update_plot()

# Function to update the plot
def update_plot():
    plt.clf()  # Clear the plot

    if len(score_history) < 2:
        return

    # X values: starting at 1 to match the events (score_history[0] is initial 0)
    x_values = range(1, len(score_history))
    y_values = score_history[1:]

    # Define color coding for different causes
    cause_colors = {
        'Ace': 'green',
        'Block': 'blue',
        'Communication': 'yellow',
        'Passing Error': 'red',
        'Serving Error': 'orange',
        'Kill': 'purple',
        'Hitting Error': 'brown',
        'Tip': 'pink',
        'Free Ball': 'cyan',
        'Court Coverage': 'gray',
        'In/Out Ball': 'black'
    }

    # Plot the main progress line in blue
    plt.plot(x_values, y_values, color='blue', linestyle='-', marker='o', markersize=8, label="Progress")

    # Add color-coded points for each cause and label the player using the old method
    for i in range(len(y_values)):
        cause = cause_history[i]  # Get the cause at index i
        player = player_history[i]  # Get the player for this event
        color = cause_colors.get(cause.split(' - ')[0], 'black')  # Default to black if no match for cause
        
        # Plot the point with the selected color
        plt.scatter(x_values[i], y_values[i], color=color, s=100, zorder=5)  # Larger markers for visibility

        # Add the player label at the point using plt.annotate
        plt.annotate(str(player), 
                    (x_values[i], y_values[i]), 
                    textcoords="offset points", 
                    xytext=(0, 10),  # Offset the text slightly above the point
                    ha='center', 
                    fontsize=9, 
                    color='black', 
                    weight='bold')

    # Label setup
    plt.xlabel("Attempts", fontsize=12)
    plt.ylabel("Momentum", fontsize=12)
    plt.title("Game Performance", fontsize=14, weight='bold')

    # Set grid and axis range
    plt.grid(True)

    # Adjust x and y limits
    if len(score_history) < window_size:
        plt.xlim(0, window_size - 1)
    else:
        plt.xlim(len(score_history) - window_size, len(score_history) - 1)

    # Adjust Y-axis range
    min_y = min(y_values) if y_values else 0
    max_y = max(y_values) if y_values else 1
    plt.ylim(min(min_y, -10), max(max_y, 10))

    # Y-axis increments
    plt.yticks(range(min(min_y, -10), max(max_y, 10) + 1, 1))

    # Create custom legend for causes
    legend_handles = [
        mlines.Line2D([0], [0], marker='o', color='w', markerfacecolor=color, markersize=10)
        for color in cause_colors.values()
    ]
    legend_labels = list(cause_colors.keys())

    # Place the legend outside the graph
    plt.legend(handles=legend_handles, labels=legend_labels, loc='upper left', bbox_to_anchor=(1, 1), title="Causes")

    # Adjust the layout to fit the legend outside the plot
    plt.tight_layout()

    # Draw the plot
    canvas.draw()

import matplotlib.pyplot as plt
from datetime import datetime

def check_game_end():
    # If either team reaches 25, save results
    if win_count[-1] >= 25 or loss_count[-1] >= 25:
        save_plot()
        generate_report()
        print("Game Over! Report and graph saved.")


def save_plot():
    # Save the current plot as an image
    plt.savefig("game_plot.png", bbox_inches="tight")
    print("Plot saved as 'game_plot.png'.")
    
def generate_report():
    global player_history, cause_history

    # Create a report of each player's contribution
    report = []
    report.append("Game Report")
    report.append(f"Final Score - Us: {win_count[-1]}, Opponent: {loss_count[-1]}")
    report.append("---- Contribution Breakdown ----")

    # Count how many times each player contributed and in what way
    player_contributions = {player: {} for player in us_players + opponent_players}

    for i in range(len(player_history)):
        player = player_history[i]
        cause = cause_history[i]
        if cause in player_contributions[player]:
            player_contributions[player][cause] += 1
        else:
            player_contributions[player][cause] = 1

    # Write player contributions to report
    for player in us_players + opponent_players:
        report.append(f"\nPlayer {player} Contribution:")
        for cause, count in player_contributions[player].items():
            report.append(f"  - {cause}: {count} times")

    # Save report to a file
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"game_report_{timestamp}.txt"
    with open(filename, "w") as file:
        file.write("\n".join(report))

    print(f"Report saved as '{filename}'.")


# Initialize player numbers input
get_player_numbers()
root.mainloop()

#1,2,3,4,5,6
#7,8,9,10,11,12