# Roblox Mechanica Object List
This document describes the behaviour of mechanical and logic blocks in the game "Mechanica" based in Roblox. 

## Notes
The Logic system in Mechanica works by taking data in from other objects which output data. All data in the system is represented by a number including boolean values. A **True** value is represented by a number greater than **0.5** if not the value is considered **False**. The system is a event based logic system, when a block output changes it sends a force update to any block depending on its data to update its own data and continue sending updates. However this can cause infinite loops, the game handles this by counting how many times a block has been activated in a event chain update and once a certain amount is reached it kills that block to prevent lag.

## Boolean Logic Blocks
Note: All **Boolean** Logic blocks either output True (1) or False(0)

### Toggle Gate (31)
The toggle gate outputs a True (1) or False (0) value depending on its state, the state can be changed via the connected **Activate** block. When the output of the block changes it checks if the value is greater than **0.5** (True). If it is, the state of the gate flips. The default state when the simulation starts is False.
#### Properties
- Activate => Object

### AND Gate (32)
The AND gate is a standard AND Logic gate which takes in two inputs, the output only changes whenever either input changes.
#### Properties
- Input 1 => Object
- Input 2 => Object

### OR Gate (33)
The OR gate is a standard OR Logic gate which takes in two inputs, the output only changes whenever either input changes.
#### Properties
- Input 1 => Object
- Input 2 => Object

### NOT Gate (34)
The NOT gate is a standard NOT Logic gate which takes in one input, the output only changes whenever the input changes.
#### Properties
- Input -> Object

### NAND Gate (35)
The NAND gate is a standard NAND Logic gate which takes in two inputs, the output only changes whenever either input changes.
#### Properties
- Input 1 => Object
- Input 2 => Object

### NOR Gate (36)
The NOR gate is a standard NOR Logic gate which takes in two inputs, the output only changes whenever either input changes.
#### Properties
- Input 1 => Object
- Input 2 => Object

### XOR Gate (37)
The XOR gate is a standard XOR Logic gate which takes in two inputs, the output only changes whenever either input changes.
#### Properties
- Input 1 => Object
- Input 2 => Object

### XNOR Gate (38)
The XNOR gate is a standard XNOR Logic gate which takes in two inputs, the output only changes whenever either input changes.
#### Properties
- Input 1 => Object
- Input 2 => Object

## Number Logic Blocks
### Delay Gate (45)
The delay gate takes in data from another block and then outputs the same data by the specified amount of time.
#### Properties
- Activate => Object
- Delay => Number (0 - 600 seconds) [Default: 1]

### Memory Gate (49)
The memory gate allows for numbers to stored whenever activated, it has two types of modes which can be changed via the **Only Update With Set** Toggle. When toggled off, as long the **Set** output is truish it will update its stored memory whenever the input data changes. However when toggled on, it only updates its memory when the **Set** input changes and is truish. The default value of the stored memory is 0.
#### Properties
- Set => Object
- Data => Object
- Only Update With Set => True/False [Default: False]

### Relay Gate (76)
The relay gate relays the input data when activated. When the **Relay** input is truish, it outputs the same data from the **Data 1** input and vice versa for **Data 0**. Important note: If the data input is not set to any valid object, the relay gates output **nothing** which is not the same as 0. Some blocks have special behaviour for a **nothing** value like the Motor, when the Motor has brake automatically turned off and receives a **nothing** value it will let the attached object freely spin until it loses all energy naturally unlike a 0 value which makes the motor use force to reach the speed of 0.
#### Properties
- Relay => Object
- Data 0 => Object
- Data 1 => Object

### Constant Gate (82)
The constant gate is self-explaintory, it outputs a constant value set by the user.
#### Properties
- Output Value => Number (-10000000 - 10000000) [Default: 0]

### Addition Gate (83)
The addition gate takes in two inputs, adds them together and outputs the result.
#### Properties
- Input 1 => Object
- Input 2 => Object

### Subtraction Gate (84)
The subtraction gate takes in two inputs, subtracts **Input 2** from **Input 1** and outputs the result.
#### Properties
- Input 1 => Object
- Input 2 => Object

### Multiply Gate (85)
The multiply gate takes in two inputs, multiplies **Input 1** by **Input 2** and outputs the result.
#### Properties
- Input 1 => Object
- Input 2 => Object

### Divide Gate (86)
The divide gate takes in two inputs, divides **Input 1** by **Input 2** and outputs the result.
#### Properties
- Input 1 => Object
- Input 2 => Object

### Round Gate (87)
The round gate takes in one input and is able to do a Round, Ceil or Floor calculation depending on the setting and outputs the result.
#### Properties
- Input => Object
- Rounding Mode => Round, Ceil, Floor [Default: Round]

### Compare Gate (88)
The compare gate takes in two inputs and does the selected comparison mode on them, it then outputs a True or False value. EqualTo: Input1 == Input 2, GreaterThan: Input1 > Input2, LessThan: Input1 < Input2.
#### Properties
- Input 1 => Object
- Input 2 => Object
- Compare Mode => EqualTo, GreaterThan, LessThan [Default: EqualTo]

## Input
### Key Detector (14)
This is a form of user input, whenever the user presses the key down of the selected key it outputs a true value and when the key lifts up it outputs false.
#### Properties
- Activation Key => String

### Sensor (21)
The sensor is a distance based sensor, it updates its output every frame. When distance mode is disabled, if something is within range of the sensor it will output a True value and vice versa. However when distance mode is enabled, it will output the distance in a normalised value (0 - 1) with 1 representing the range set on the seneor.
#### Properties
- Range => Number (0 - 500 Studs) [Default: 20]
- Distance Mode => Boolean [Default: False]
- Ignore Water => Boolean [Default: False]

### Wireless Transceiver (44)
A wireless transceiver is a special block which allows communication between player builds, it also simulates the time of sending the data by adding a artifical delay when sending data to other transceivers depending on the physical distance between the transceivers. It can be configured to have a specific channel so it won't send or receive data from unwanted transceivers.
#### Properties
- Send Signal => Object
- Channel => Number (-4000 - 4000) [Default: 0]

### Push Button (61)
A button which a user can push, it has two modes. A toggle mode and a normal button mode, in toggle mode it acts like a normal push button connected to a toggle gate only flipping states when the user pushes the button down again. In normal mode, it outputs True when the button is pushed down and outputs False when the button is released.
#### Properties
- Toggle => True/False [Default: False]

## Misc
### Flat Light Panel (47)
A block which takes in either a Brightness Input value or three separate R, G and B values depending on the mode.
#### Properties
- Input Mode => Brightness, RGB [Default: Brightness]
- Activate [Input Mode == Brightness] => Object
- Red [Input Mode == RGB] => Object
- Green [Input Mode == RGB] => Object
- Blue [Input Mode == RGB] => Object
- Light Color => RGB

### Number Display (89)
A block which displays the input number as text in the game world.
#### Properties
- Input => Object
- Text Color => RGB
- Background Color => RGB
